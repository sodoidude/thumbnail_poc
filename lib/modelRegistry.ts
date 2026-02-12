// lib/modelRegistry.ts

/**
 * 목적
 * - UI/engineConfig에서는 provider를 openai|gemini|anthropic 그대로 사용
 * - 서버에서는 getApiVendor(provider)로 openai|google|anthropic 분기
 * - 모델 ID(id)는 UI/검증용, apiModel은 실제 API 호출용(없으면 id 사용)
 * - SettingsModal/route.ts 모두 이 파일을 단일 진실로 사용
 */

// UI/engineConfig에서 쓰는 provider 식별자(기존 유지)
export type Provider = "openai" | "gemini" | "anthropic";

// 실제 서버 호출(벤더 SDK/클라이언트) 분기용 키
export type ApiVendor = "openai" | "google" | "anthropic";

// Provider -> ApiVendor 매핑 (gemini는 google로 호출)
export function getApiVendor(provider: Provider): ApiVendor {
  switch (provider) {
    case "gemini":
      return "google";
    default:
      return provider;
  }
}

// Text 모델 ID 목록 (UI 옵션/서버 검증에 사용)
export type TextModelId =
  | "gpt-5.2"
  | "gpt-5.1"
  | "gpt-4.1-mini"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "claude-sonnet"
  | "claude-haiku";

// Image 모델 ID 목록 (UI 옵션/서버 검증에 사용)
export type ImageModelId =
  | "gpt-image-1-mini"
  | "gpt-image-1"
  | "gemini-2.5-flash-image";

export type EngineConfig = {
  // Text Engine: 분석/컨셉/프롬프트 생성
  textProvider: Provider;
  textModel: TextModelId;

  // Image Engine: 실제 이미지 생성/편집
  // Claude(Anthropic)는 이미지 출력이 안 되므로 제외
  imageProvider: Exclude<Provider, "anthropic">;
  imageModel: ImageModelId;
};

export type ModelOption = {
  id: string;
  label: string;
  provider: Provider;
  kind: "text" | "image";
  enabled: boolean;
  notes?: string;

  // ✅ 실제 API 호출에 쓰는 모델명(없으면 id를 그대로 사용)
  apiModel?: string;

  // UI/검증에서 쓰기 좋은 capability 메타(선택)
  capabilities?: {
    inputImage?: boolean;
    outputImage?: boolean;
  };
};

// 기본 선택값(초기 PoC 기본값)
export const defaultConfig: EngineConfig = {
  textProvider: "openai",
  textModel: "gpt-4.1-mini",
  imageProvider: "openai",
  imageModel: "gpt-image-1-mini",
};

// Text 모델 옵션 목록 (UI 드롭다운에 그대로 사용)
export const TEXT_MODELS: ModelOption[] = [
  {
    id: "gpt-5.2",
    label: "ChatGPT 5.2",
    provider: "openai",
    kind: "text",
    enabled: true,
    capabilities: { inputImage: true },
  },
  {
    id: "gpt-5.1",
    label: "ChatGPT 5.1",
    provider: "openai",
    kind: "text",
    enabled: true,
    capabilities: { inputImage: true },
  },
  {
    id: "gpt-4.1-mini",
    label: "ChatGPT 4.1 mini",
    provider: "openai",
    kind: "text",
    enabled: true,
    capabilities: { inputImage: true },
  },

  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    kind: "text",
    enabled: true,
    capabilities: { inputImage: true },
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    kind: "text",
    enabled: true,
    capabilities: { inputImage: true },
  },

  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    provider: "anthropic",
    kind: "text",
    enabled: true,
    capabilities: { inputImage: false },
    // ✅ Anthropic 실제 호출 모델명
    apiModel: "claude-3-5-sonnet-latest",
  },
  {
    id: "claude-haiku",
    label: "Claude Haiku",
    provider: "anthropic",
    kind: "text",
    enabled: true,
    capabilities: { inputImage: false },
    // ✅ Anthropic 실제 호출 모델명
    apiModel: "claude-3-5-haiku-latest",
  },
];

// Image 모델 옵션 목록 (UI 드롭다운에 그대로 사용)
export const IMAGE_MODELS: ModelOption[] = [
  {
    id: "gpt-image-1-mini",
    label: "OpenAI gpt-image-1-mini",
    provider: "openai",
    kind: "image",
    enabled: true,
    capabilities: { inputImage: true, outputImage: true },
  },
  {
    id: "gpt-image-1",
    label: "OpenAI gpt-image-1",
    provider: "openai",
    kind: "image",
    enabled: true,
    capabilities: { inputImage: true, outputImage: true },
  },

  {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image (Nano Banana)",
    provider: "gemini",
    kind: "image",
    enabled: true,
    capabilities: { inputImage: true, outputImage: true },
  },
];

// 서버 검증용: provider+model 조합이 목록에 존재하는지 확인
export function isValidTextModel(provider: Provider, model: string): model is TextModelId {
  return TEXT_MODELS.some((m) => m.provider === provider && m.id === model && m.enabled);
}

export function isValidImageModel(
  provider: Exclude<Provider, "anthropic">,
  model: string
): model is ImageModelId {
  return IMAGE_MODELS.some((m) => m.provider === provider && m.id === model && m.enabled);
}

/**
 * ✅ route.ts에서 “실제 API 모델명” 얻을 때 사용
 * - 찾으면 option.apiModel, 없으면 id 그대로
 */
export function resolveApiModel(
  provider: Provider,
  kind: "text" | "image",
  id: string
): string {
  const list = kind === "text" ? TEXT_MODELS : IMAGE_MODELS;
  const found = list.find((m) => m.enabled && m.provider === provider && m.kind === kind && m.id === id);
  return found?.apiModel || id;
}

/**
 * ✅ UI/서버 공용: 특정 모델 옵션 조회
 */
export function getModelOption(
  provider: Provider,
  kind: "text" | "image",
  id: string
): ModelOption | undefined {
  const list = kind === "text" ? TEXT_MODELS : IMAGE_MODELS;
  return list.find((m) => m.enabled && m.provider === provider && m.kind === kind && m.id === id);
}

/**
 * ✅ 저장된 config/외부 입력이 깨졌을 때 안전하게 보정
 * - SettingsModal, route.ts에서 재사용 가능
 */
export function normalizeEngineConfig(input: Partial<EngineConfig> | null | undefined): EngineConfig {
  const merged: EngineConfig = { ...defaultConfig, ...(input || {}) } as EngineConfig;

  // Text 조합 보정
  if (!isValidTextModel(merged.textProvider, merged.textModel)) {
    merged.textProvider = defaultConfig.textProvider;
    merged.textModel = defaultConfig.textModel;
  }

  // Image provider 방어(anthropic이 들어오면 기본값으로)
  if ((merged.imageProvider as any) === "anthropic") {
    merged.imageProvider = defaultConfig.imageProvider;
    merged.imageModel = defaultConfig.imageModel;
  }

  // Image 조합 보정
  if (!isValidImageModel(merged.imageProvider, merged.imageModel)) {
    merged.imageProvider = defaultConfig.imageProvider;
    merged.imageModel = defaultConfig.imageModel;
  }

  return merged;
}
