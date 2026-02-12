// app/api/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  defaultConfig,
  normalizeEngineConfig,
  resolveApiModel,
  getApiVendor,
  type EngineConfig,
  type Provider,
} from "../../../lib/modelRegistry";
import { prisma } from "../../../lib/prisma";
import { calcTextCostUsd, calcImageCostUsd, type TokenUsage } from "../../../lib/costing";

export const runtime = "nodejs"; // file upload 처리 안정

type GenResult = {
  concept_used: string;
  image_base64: string; // png base64
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/** OpenAI Responses API text 추출 */
function getOpenAITextOut(json: any) {
  return (
    (json.output || [])
      .flatMap((o: any) => (o.content || []).map((c: any) => c.text).filter(Boolean))
      .join("\n") || ""
  );
}

/** OpenAI usage */
function getOpenAIUsage(json: any): TokenUsage {
  const u = json?.usage || {};
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const total = u.total_tokens || input + output;
  return { input, output, total };
}

/** data URL 파싱 */
function parseDataUrl(dataUrl: string): { mime: string; b64: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("dataUrl 파싱 실패");
  return { mime: m[1], b64: m[2] };
}

/** Gemini 텍스트 추출 + usage */
function geminiTextFromResponse(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  return (
    parts
      .map((p: any) => p?.text)
      .filter(Boolean)
      .join("\n") || ""
  );
}
function geminiUsage(json: any): TokenUsage {
  const u = json?.usageMetadata || {};
  const input = u.promptTokenCount || 0;
  const output = u.candidatesTokenCount || 0;
  const total = u.totalTokenCount || input + output;
  return { input, output, total };
}
function geminiGenerateContentUrl(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
}

/** Claude 텍스트 추출 + usage */
function claudeTextFromResponse(json: any): string {
  const content = json?.content || [];
  return (
    content
      .filter((c: any) => c?.type === "text" && c?.text)
      .map((c: any) => c.text)
      .join("\n") || ""
  );
}
function claudeUsage(json: any): TokenUsage {
  const u = json?.usage || {};
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const total = input + output;
  return { input, output, total };
}

type Vendor = ReturnType<typeof getApiVendor>;

/**
 * ─────────────────────────────────────────────────────────────
 * ✅ NEW: JSON 안전 파서 (모델이 앞/뒤에 잡담 섞어도 최대한 복구)
 * ─────────────────────────────────────────────────────────────
 */
function safeParseJson<T = any>(text: string): T | null {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * ─────────────────────────────────────────────────────────────
 * ✅ NEW: 3단 프롬프트 빌더 (VISION / CONCEPT / IMAGE)
 * ─────────────────────────────────────────────────────────────
 */

function buildVisionPrompt(title: string) {
  return `
You are analyzing an e-commerce product image.

Goal:
- Extract immutable product characteristics so the product can be treated as LOCKED in later steps.

CRITICAL RULES:
- The product must NEVER be altered in shape, proportions, structure, logo, printed text, or color.
- Identify what must remain identical. Do NOT propose styling changes.
- Return ONLY JSON. No extra text.

Product title: ${title}

JSON schema:
{
  "product_type": "short category description",
  "immutable_elements": [
    "shape characteristics",
    "colorway",
    "logo placement",
    "printed text on the product (if any)",
    "material/texture cues"
  ],
  "distinguishing_features": [
    "feature 1",
    "feature 2"
  ]
}
`.trim();
}

function buildConceptPrompt(args: {
  title: string;
  vision: any; // vision_json
  userConcept?: string;
}) {
  const { title, vision, userConcept } = args;

  return `
You are a professional e-commerce product art director.

Task:
- Fill the slots for a studio product photo prompt template.
- If the user provided a concept, reflect it. If not, invent sensible defaults.
- The product is LOCKED. Only background, lighting, camera angle, composition, and mood may change.

CRITICAL RULES:
- NEVER change the product shape, proportions, structure, logo, printed text, or colorway.
- Do NOT add any text/typography/slogans/badges/stickers/labels/watermarks.
- Return ONLY JSON. No extra text.

Product title: ${title}
Vision JSON: ${JSON.stringify(vision)}
User requested concept (optional): ${userConcept || "(none)"}

Return ONLY this JSON (exact keys):
{
  "one_line_concept": "short Korean sentence describing the direction",
  "product_description": "fact-based physical description of the product (include color/material; do NOT invent new parts)",
  "background": "background surface/description (studio-friendly)",
  "lighting_setup": "lighting setup (e.g., three-point softbox setup)",
  "lighting_purpose": "lighting purpose (e.g., reveal texture, clean silhouette, premium feel)",
  "camera_angle": "angle type (e.g., 3/4 front, top-down, straight-on)",
  "showcase_feature": "specific feature to showcase (e.g., logo placement, zipper details)",
  "key_detail": "detail to keep sharp focus on (e.g., stitching, texture, zipper)",
  "aspect_ratio": "1:1"
}
`.trim();
}

function buildFinalImagePrompt(args: {
  title: string;
  vision: any;
  direction: any;
}) {
  const { title, vision, direction } = args;

  const immutable: string[] = Array.isArray(vision?.immutable_elements) ? vision.immutable_elements : [];
  const immutableLine = immutable.length ? `- Immutable elements: ${immutable.join("; ")}` : "";

  // ✅ 템플릿 강제 + (상단) 상품 LOCK + (하단) 텍스트 통제
  return `
This is a background and lighting adjustment task only. Treat the product as LOCKED and immutable.
The product must remain 100% identical in shape, proportions, structure, logo, printed text, and colorway.
No redesign. No modification. No distortion. No stylization.
${immutableLine}

A high-resolution, studio-lit product photograph of a ${direction.product_description}
on a ${direction.background}. The lighting is a ${direction.lighting_setup}
to ${direction.lighting_purpose}. The camera angle is a ${direction.camera_angle}
to showcase ${direction.showcase_feature}. Ultra-realistic, with sharp focus on ${direction.key_detail}. ${direction.aspect_ratio}.

STRICT TEXT RULES:
- Do NOT add any text, typography, letters, numbers, slogans, badges, labels, stickers, or watermarks.
- Remove any floating/background text that is NOT physically printed on the product.
- If text exists as part of the product itself, keep it unchanged (do NOT remove or alter it).
- No advertisement-style overlays.
- Do not add props or effects that imply false functionality.

Product title: ${title}
`.trim();
}

async function callTextModel(params: {
  vendor: Vendor;
  apiModel: string; // ✅ resolveApiModel로 얻은 실제 모델명
  prompt: string;
  dataUrl?: string; // vision일 때만
  openaiKey?: string;
  geminiKey?: string;
  anthropicKey?: string;
}) {
  const { vendor, apiModel, prompt, dataUrl, openaiKey, geminiKey, anthropicKey } = params;

  // ✅ OpenAI (Responses API)
  if (vendor === "openai") {
    const body = dataUrl
      ? {
          model: apiModel,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                { type: "input_image", image_url: dataUrl },
              ],
            },
          ],
        }
      : { model: apiModel, input: prompt };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`OpenAI 텍스트 호출 실패: ${await res.text()}`);
    const json = await res.json();
    return { text: getOpenAITextOut(json), usage: getOpenAIUsage(json), raw: json };
  }

  // ✅ Gemini (Google) - REST generateContent
  if (vendor === "google") {
    if (!geminiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

    const parts: any[] = [{ text: prompt }];

    if (dataUrl) {
      const { mime, b64 } = parseDataUrl(dataUrl);
      parts.push({
        inline_data: {
          mime_type: mime,
          data: b64,
        },
      });
    }

    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2 },
    };

    const res = await fetch(geminiGenerateContentUrl(apiModel), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gemini 텍스트 호출 실패: ${await res.text()}`);
    const json = await res.json();
    return { text: geminiTextFromResponse(json), usage: geminiUsage(json), raw: json };
  }

  // ✅ Anthropic (Claude) - REST /v1/messages
  if (vendor === "anthropic") {
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

    const content: any[] = [{ type: "text", text: prompt }];

    // (주의) 우리는 기본적으로 Claude Vision은 쓰지 않도록 chooseVisionEngine에서 분기함
    if (dataUrl) {
      const { mime, b64 } = parseDataUrl(dataUrl);
      content.push({
        type: "image",
        source: { type: "base64", media_type: mime, data: b64 },
      });
    }

    const body = {
      model: apiModel,
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Anthropic 텍스트 호출 실패: ${await res.text()}`);
    const json = await res.json();
    return { text: claudeTextFromResponse(json), usage: claudeUsage(json), raw: json };
  }

  throw new Error(`Unknown vendor: ${vendor}`);
}

async function callImageEdit(params: {
  vendor: Vendor;
  apiModel: string; // ✅ resolveApiModel로 얻은 실제 모델명
  prompt: string;
  buf: Buffer;
  mime: string;
  openaiKey?: string;
  geminiKey?: string;
}) {
  const { vendor, apiModel, prompt, buf, mime, openaiKey, geminiKey } = params;

  // ✅ OpenAI (Images edits)
  if (vendor === "openai") {
    const fd = new FormData();
    fd.append("model", apiModel);
    fd.append("prompt", prompt);
    fd.append("image", new Blob([buf], { type: mime }), "input.png");
    fd.append("n", "1");
    fd.append("size", "1024x1024");
    fd.append("output_format", "png");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: fd,
    });

    if (!res.ok) throw new Error(`OpenAI 이미지 편집 실패: ${await res.text()}`);
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("이미지 응답 파싱 실패");

    return { b64, usage: undefined as TokenUsage | undefined, raw: json };
  }

  // ✅ Gemini Image - REST generateContent
  if (vendor === "google") {
    if (!geminiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

    const b64In = buf.toString("base64");

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mime,
                data: b64In,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["Image"],
        imageConfig: { aspectRatio: "1:1" },
      },
    };

    const res = await fetch(geminiGenerateContentUrl(apiModel), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Gemini 이미지 호출 실패: ${await res.text()}`);
    const json = await res.json();

    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find((p: any) => p?.inline_data?.data || p?.inlineData?.data);
    const outB64 = inline?.inline_data?.data || inline?.inlineData?.data;

    if (!outB64) {
      const textFallback = parts.map((p: any) => p?.text).filter(Boolean).join("\n");
      throw new Error(`Gemini 이미지 응답 파싱 실패 (텍스트: ${textFallback || "없음"})`);
    }

    const usage = geminiUsage(json);
    return { b64: outB64, usage, raw: json };
  }

  if (vendor === "anthropic") {
    throw new Error("Anthropic은 이미지 생성/편집을 지원하지 않습니다.");
  }

  throw new Error(`Image vendor not supported: ${vendor}`);
}

/**
 * ✅ Vision 단계에서 사용할 엔진을 결정
 * - 기본: 사용자가 선택한 Text Engine 사용
 * - 예외: Text Provider가 anthropic이면 Vision은 OpenAI(우선) -> Gemini로 fallback
 */
function chooseVisionEngine(args: { cfg: EngineConfig; openaiKey?: string; geminiKey?: string }) {
  const { cfg, openaiKey, geminiKey } = args;

  if (cfg.textProvider === "anthropic") {
    if (openaiKey) {
      const provider: Provider = "openai";
      const vendor = getApiVendor(provider);
      const apiModel = resolveApiModel(provider, "text", defaultConfig.textModel); // gpt-4.1-mini
      return { provider, vendor, apiModel };
    }
    if (geminiKey) {
      const provider: Provider = "gemini";
      const vendor = getApiVendor(provider);
      const apiModel = resolveApiModel(provider, "text", "gemini-2.5-flash"); // 비용/속도 우선
      return { provider, vendor, apiModel };
    }
    throw new Error(
      "Claude(Text) 선택 시 Vision 분석을 위해 OPENAI_API_KEY 또는 GEMINI_API_KEY가 필요합니다."
    );
  }

  const provider = cfg.textProvider;
  const vendor = getApiVendor(provider);
  const apiModel = resolveApiModel(provider, "text", cfg.textModel);
  return { provider, vendor, apiModel };
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let requestLogId: string | null = null;

  try {
    // 1) 입력 파싱
    const form = await req.formData();

    const imageFile = form.get("image");
    const title = String(form.get("title") || "").trim();
    const userConcept = String(form.get("concept") || "").trim();

    // 2) engineConfig 로드 + 보정
    const cfgRaw = String(form.get("engineConfig") || "{}");
    let cfg: EngineConfig = { ...defaultConfig };

    try {
      cfg = normalizeEngineConfig(JSON.parse(cfgRaw));
    } catch {
      cfg = normalizeEngineConfig(defaultConfig);
    }

    // 3) 필수 검증
    if (!title) return bad("상품명(title)은 필수입니다.");
    if (!(imageFile instanceof File)) return bad("이미지(image)는 필수입니다.");

    // 4) 이미지 -> base64 data url
    const buf = Buffer.from(await imageFile.arrayBuffer());
    const mime = imageFile.type || "image/png";
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

    // 5) Provider -> Vendor + API Key
    const textVendor = getApiVendor(cfg.textProvider);
    const imageVendor = getApiVendor(cfg.imageProvider);

    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    // Key 체크 (Concept/Text 단계용)
    if (textVendor === "openai" && !openaiKey) return bad("OPENAI_API_KEY가 설정되지 않았습니다.", 500);
    if (textVendor === "google" && !geminiKey) return bad("GEMINI_API_KEY가 설정되지 않았습니다.", 500);
    if (textVendor === "anthropic" && !anthropicKey) return bad("ANTHROPIC_API_KEY가 설정되지 않았습니다.", 500);

    // Image 단계용
    if (imageVendor === "openai" && !openaiKey) return bad("OPENAI_API_KEY가 설정되지 않았습니다.", 500);
    if (imageVendor === "google" && !geminiKey) return bad("GEMINI_API_KEY가 설정되지 않았습니다.", 500);
    if (imageVendor === "anthropic") return bad("Anthropic은 이미지 생성/편집을 지원하지 않습니다.", 400);

    // ✅ 6) RequestLog를 먼저 만든다
    const requestLog = await prisma.requestLog.create({
      data: {
        title,
        userConcept: userConcept || null,
        conceptUsed: null,
        textProvider: cfg.textProvider,
        textModel: cfg.textModel,
        imageProvider: cfg.imageProvider,
        imageModel: cfg.imageModel,
        success: false,
        errorMessage: null,
        totalCostUsd: 0,
        latencyMs: 0,
      },
    });
    requestLogId = requestLog.id;

    // ✅ 실제 API 모델명 resolve (Concept/Text용)
    const textApiModel = resolveApiModel(cfg.textProvider, "text", cfg.textModel);
    const imageApiModel = resolveApiModel(cfg.imageProvider as any, "image", cfg.imageModel);

    // ✅ Vision용 엔진 결정
    const visionEngine = chooseVisionEngine({ cfg, openaiKey, geminiKey });

    let totalCostUsd = 0;

    /**
     * ─────────────────────────────────────────────────────────────
     * 7) VISION (immutable 추출)
     * ─────────────────────────────────────────────────────────────
     */
    const visionPrompt = buildVisionPrompt(title);

    const visionCall = await callTextModel({
      vendor: visionEngine.vendor,
      apiModel: visionEngine.apiModel,
      prompt: visionPrompt,
      dataUrl,
      openaiKey,
      geminiKey,
      anthropicKey,
    });

    const vU = visionCall.usage;
    const vCost = calcTextCostUsd(visionEngine.vendor, visionEngine.apiModel, vU);
    totalCostUsd += vCost;

    await prisma.requestCostLineItem.create({
      data: {
        requestId: requestLog.id,
        stage: "VISION",
        provider: visionEngine.provider,
        model: visionEngine.apiModel,
        inputTokens: vU.input,
        outputTokens: vU.output,
        totalTokens: vU.total,
        costUsd: vCost,
      },
    });

    const visionJson =
      safeParseJson<any>(visionCall.text) ?? {
        product_type: "product",
        immutable_elements: [],
        distinguishing_features: [],
        raw: visionCall.text,
      };

    /**
     * ─────────────────────────────────────────────────────────────
     * 8) CONCEPT (템플릿 슬롯 JSON 생성)
     * ─────────────────────────────────────────────────────────────
     */
    const conceptPrompt = buildConceptPrompt({
      title,
      vision: visionJson, // ✅ 여기서 ‘vision_json’이 등장함 (Vision 출력 JSON)
      userConcept: userConcept || undefined,
    });

    const conceptCall = await callTextModel({
      vendor: textVendor,
      apiModel: textApiModel,
      prompt: conceptPrompt,
      openaiKey,
      geminiKey,
      anthropicKey,
    });

    const cU = conceptCall.usage;
    const cCost = calcTextCostUsd(textVendor, textApiModel, cU);
    totalCostUsd += cCost;

    await prisma.requestCostLineItem.create({
      data: {
        requestId: requestLog.id,
        stage: "CONCEPT",
        provider: cfg.textProvider,
        model: textApiModel,
        inputTokens: cU.input,
        outputTokens: cU.output,
        totalTokens: cU.total,
        costUsd: cCost,
      },
    });

    const direction =
      safeParseJson<any>(conceptCall.text) ?? {
        one_line_concept: userConcept || "스튜디오 라이팅으로 제품 선명 강조",
        product_description: "the product (accurate description required)",
        background: "a clean neutral studio surface",
        lighting_setup: "three-point softbox setup",
        lighting_purpose: "create a clean premium silhouette and reveal texture",
        camera_angle: "3/4 front angle",
        showcase_feature: "the product’s main form and key brand elements",
        key_detail: "material texture and stitching",
        aspect_ratio: "1:1",
      };

    // DB에 저장할 conceptUsed: 한 줄 컨셉 우선, 없으면 userConcept, 그래도 없으면 기본값
    const conceptUsed =
      String(direction?.one_line_concept || "").trim() ||
      (userConcept || "스튜디오 무드로 제품 강조");

    /**
     * ─────────────────────────────────────────────────────────────
     * 9) IMAGE EDIT (강제 템플릿 + 상품 LOCK + 텍스트 통제)
     * ─────────────────────────────────────────────────────────────
     */
    const editPrompt = buildFinalImagePrompt({
      title,
      vision: visionJson,
      direction,
    });

    const imgCall = await callImageEdit({
      vendor: imageVendor,
      apiModel: imageApiModel,
      prompt: editPrompt,
      buf,
      mime,
      openaiKey,
      geminiKey,
    });

    const b64 = imgCall.b64;

    const imgCost = calcImageCostUsd({
      vendor: imageVendor,
      apiModel: imageApiModel,
      imageCount: 1,
      quality: "low", // PoC는 1024x1024 + low로 고정(재현성/설명 가능)
      usage: imageVendor === "google" ? imgCall.usage : undefined,
    });
    totalCostUsd += imgCost;

    await prisma.requestCostLineItem.create({
      data: {
        requestId: requestLog.id,
        stage: "IMAGE_EDIT",
        provider: cfg.imageProvider,
        model: imageApiModel,
        imageSize: 1024,
        imageCount: 1,
        costUsd: imgCost,
      },
    });

    // 10) RequestLog 성공 처리
    const latencyMs = Date.now() - startedAt;
    await prisma.requestLog.update({
      where: { id: requestLog.id },
      data: {
        conceptUsed,
        success: true,
        errorMessage: null,
        latencyMs,
        totalCostUsd,
      },
    });

    const result: GenResult = {
      concept_used: conceptUsed,
      image_base64: b64,
    };

    return NextResponse.json(result);
  } catch (e: any) {
    const latencyMs = Date.now() - startedAt;
    const msg = String(e?.message || e || "unknown error");

    if (requestLogId) {
      await prisma.requestLog.update({
        where: { id: requestLogId },
        data: {
          success: false,
          errorMessage: msg,
          latencyMs,
        },
      });
    }

    return bad(msg, 500);
  }
}
