// lib/costing.ts
import type { ApiVendor } from "./modelRegistry";

export type TokenUsage = { input: number; output: number; total: number };

const PER_M = 1_000_000;

function usd(n: number) {
  // DB 저장용: 소수 6자리 정도로 고정(원하면 4자리도 OK)
  return Math.round(n * 1e6) / 1e6;
}

/**
 * 텍스트 토큰 단가표 (USD per 1M tokens)
 * - input/output 기준
 */
const TEXT_RATES: Record<
  ApiVendor,
  Record<string, { inputPerM: number; outputPerM: number }>
> = {
  openai: {
    "gpt-5.2": { inputPerM: 3.5, outputPerM: 28.0 }, // :contentReference[oaicite:6]{index=6}
    "gpt-5.1": { inputPerM: 2.5, outputPerM: 20.0 }, // :contentReference[oaicite:7]{index=7}
    "gpt-4.1-mini": { inputPerM: 0.7, outputPerM: 2.8 }, // :contentReference[oaicite:8]{index=8}
  },
  google: {
    // gemini-2.5-pro (<=200k prompts) :contentReference[oaicite:9]{index=9}
    "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10.0 },
    // gemini-2.5-flash :contentReference[oaicite:10]{index=10}
    "gemini-2.5-flash": { inputPerM: 0.30, outputPerM: 2.50 },
  },
  anthropic: {
    // claude-3-5-sonnet-latest: $3 / MTok in, $15 / MTok out (Anthropic 발표) :contentReference[oaicite:11]{index=11}
    "claude-3-5-sonnet-latest": { inputPerM: 3.0, outputPerM: 15.0 },
    // haiku 3.5 (가격표) :contentReference[oaicite:12]{index=12}
    "claude-3-5-haiku-latest": { inputPerM: 0.8, outputPerM: 4.0 },
  },
};

/**
 * 이미지 단가표 (USD per image)
 * - 지금 PoC는 1024x1024 고정이므로 그 기준만 둔다
 */
const IMAGE_PER_IMAGE: Record<
  ApiVendor,
  Record<string, { low?: number; medium?: number; high?: number; fixedPerImage?: number }>
> = {
  openai: {
    // gpt-image-1-mini 1024x1024 low: $0.005 :contentReference[oaicite:13]{index=13}
    "gpt-image-1-mini": { low: 0.005, medium: 0.011, high: 0.036 },
    // gpt-image-1 1024x1024 low: $0.011 :contentReference[oaicite:14]{index=14}
    "gpt-image-1": { low: 0.011, medium: 0.042, high: 0.167 },
  },
  google: {
    // gemini-2.5-flash-image: output $0.039 per image (1024x1024 기준) :contentReference[oaicite:15]{index=15}
    "gemini-2.5-flash-image": { fixedPerImage: 0.039 },
  },
  anthropic: {},
};

export function calcTextCostUsd(vendor: ApiVendor, apiModel: string, usage: TokenUsage) {
  const rate = TEXT_RATES[vendor]?.[apiModel];
  if (!rate) return 0;

  const inCost = (usage.input / PER_M) * rate.inputPerM;
  const outCost = (usage.output / PER_M) * rate.outputPerM;
  return usd(inCost + outCost);
}

export function calcImageCostUsd(params: {
  vendor: ApiVendor;
  apiModel: string;
  imageCount: number;
  quality?: "low" | "medium" | "high";
  // Gemini flash-image는 입력 토큰도 과금되므로(텍스트/이미지 입력 토큰),
  // 해당 usage를 함께 받아서 input token 비용도 합칠 수 있게 함
  usage?: TokenUsage;
}) {
  const { vendor, apiModel, imageCount, quality = "low", usage } = params;

  // OpenAI: per-image로 계산 (token 기반까지 엄밀히 가려면 image token까지 봐야 하는데,
  // PoC는 "이미지 1장당 가격"이 더 명확/재현 가능)
  if (vendor === "openai") {
    const table = IMAGE_PER_IMAGE.openai?.[apiModel];
    const per = (table?.[quality] ?? table?.low ?? 0);
    return usd(per * imageCount);
  }

  // Gemini: output은 장당 과금 + input token 과금(0.30/1M for 2.5 Flash 기준)
  if (vendor === "google") {
    const table = IMAGE_PER_IMAGE.google?.[apiModel];
    const perOut = table?.fixedPerImage ?? 0;

    // flash-image는 “텍스트 input/output 단가가 2.5 Flash와 동일”이라고 명시 :contentReference[oaicite:16]{index=16}
    // PoC에선 output을 장당 과금으로 처리하니, token 비용은 input만 더한다(중복 방지)
    const inputRate = TEXT_RATES.google["gemini-2.5-flash"]?.inputPerM ?? 0.30;
    const inTok = usage?.input ?? 0;
    const inCost = (inTok / PER_M) * inputRate;

    return usd(inCost + perOut * imageCount);
  }

  return 0;
}
