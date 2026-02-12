"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultConfig,
  TEXT_MODELS,
  IMAGE_MODELS,
  normalizeEngineConfig,
  type EngineConfig,
  type Provider,
} from "../../lib/modelRegistry";

const STORAGE_KEY = "windly_thumb_poc_engine_config";

type ProviderAvailability = {
  openai: boolean;
  gemini: boolean;
  anthropic: boolean;
};

function getStoredConfig(): EngineConfig {
  if (typeof window === "undefined") return defaultConfig;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig;
    return normalizeEngineConfig(JSON.parse(raw));
  } catch {
    return defaultConfig;
  }
}

function storeConfig(cfg: EngineConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function firstEnabledTextModel(provider: Provider): EngineConfig["textModel"] {
  const first = TEXT_MODELS.find((m) => m.enabled && m.provider === provider);
  return (first?.id as any) ?? defaultConfig.textModel;
}

function firstEnabledImageModel(provider: EngineConfig["imageProvider"]): EngineConfig["imageModel"] {
  const first = IMAGE_MODELS.find((m) => m.enabled && m.provider === provider);
  return (first?.id as any) ?? defaultConfig.imageModel;
}

function pickFirstAvailableTextProvider(avail: ProviderAvailability): Provider | null {
  if (avail.openai) return "openai";
  if (avail.gemini) return "gemini";
  if (avail.anthropic) return "anthropic";
  return null;
}

function pickFirstAvailableImageProvider(avail: ProviderAvailability): EngineConfig["imageProvider"] | null {
  if (avail.openai) return "openai";
  if (avail.gemini) return "gemini";
  return null;
}

export function SettingsModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (cfg: EngineConfig) => void;
}) {
  const [cfg, setCfg] = useState<EngineConfig>(defaultConfig);

  const [avail, setAvail] = useState<ProviderAvailability>({
    openai: true,
    gemini: true,
    anthropic: true,
  });
  const [availLoaded, setAvailLoaded] = useState(false);

  const textModels = useMemo(
    () => TEXT_MODELS.filter((m) => m.provider === cfg.textProvider && m.enabled),
    [cfg.textProvider]
  );

  const imageModels = useMemo(
    () => IMAGE_MODELS.filter((m) => m.provider === cfg.imageProvider && m.enabled),
    [cfg.imageProvider]
  );

  const providers: { id: Provider; label: string }[] = [
    { id: "openai", label: "ChatGPT (OpenAI)" },
    { id: "gemini", label: "Gemini (Google)" },
    { id: "anthropic", label: "Claude (Anthropic)" },
  ];

  const imageProviderOptions = useMemo(() => {
    const ids = Array.from(new Set(IMAGE_MODELS.filter((m) => m.enabled).map((m) => m.provider)));
    return ids as Array<EngineConfig["imageProvider"]>;
  }, []);

  async function fetchAvailability(): Promise<ProviderAvailability> {
    const res = await fetch("/api/providers", { method: "GET" });
    if (!res.ok) return { openai: true, gemini: true, anthropic: true };
    return (await res.json()) as ProviderAvailability;
  }

  function normalizeWithAvailability(inputCfg: EngineConfig, a: ProviderAvailability): EngineConfig {
    let next = normalizeEngineConfig(inputCfg);

    // Text provider 키 없으면 보정
    if (!a[next.textProvider]) {
      const p = pickFirstAvailableTextProvider(a);
      if (p) {
        next.textProvider = p;
        next.textModel = firstEnabledTextModel(p);
      }
    }

    // Image provider 키 없으면 보정
    const imageProviderKeyOk =
      (next.imageProvider === "openai" && a.openai) || (next.imageProvider === "gemini" && a.gemini);

    if (!imageProviderKeyOk) {
      const ip = pickFirstAvailableImageProvider(a);
      if (ip) {
        next.imageProvider = ip;
        next.imageModel = firstEnabledImageModel(ip);
      }
    }

    return next;
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      const stored = getStoredConfig();
      const a = await fetchAvailability();
      if (cancelled) return;

      setAvail(a);
      setAvailLoaded(true);

      const normalized = normalizeWithAvailability(stored, a);
      setCfg(normalized);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const canUseOpenAI = avail.openai;
  const canUseGemini = avail.gemini;
  const canUseAnthropic = avail.anthropic;

  const canUseImageOpenAI = avail.openai;
  const canUseImageGemini = avail.gemini;

  const isClaudeText = cfg.textProvider === "anthropic";

  // ✅ Vision fallback이 가능한지(Claude일 때 중요)
  const visionFallbackAvailable = canUseOpenAI || canUseGemini;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "white",
          borderRadius: 14,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>설정</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18 }}>
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          {availLoaded ? (
            <>
              사용 가능: {canUseOpenAI ? "OpenAI ✅" : "OpenAI ❌"} /{" "}
              {canUseGemini ? "Gemini ✅" : "Gemini ❌"} /{" "}
              {canUseAnthropic ? "Claude ✅" : "Claude ❌"}{" "}
              <span style={{ color: "#999" }}>(키가 없으면 선택이 비활성화돼요)</span>
            </>
          ) : (
            <>키 상태 확인 중…</>
          )}
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
          {/* Text Engine */}
          <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Text Engine</div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>AI 종류</div>
                <select
                  value={cfg.textProvider}
                  onChange={(e) => {
                    const nextProvider = e.target.value as Provider;
                    const firstModel = firstEnabledTextModel(nextProvider);

                    setCfg((p) =>
                      normalizeEngineConfig({
                        ...p,
                        textProvider: nextProvider,
                        textModel: firstModel,
                      })
                    );
                  }}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  {providers.map((p) => {
                    const disabled =
                      (p.id === "openai" && !canUseOpenAI) ||
                      (p.id === "gemini" && !canUseGemini) ||
                      (p.id === "anthropic" && !canUseAnthropic);

                    return (
                      <option key={p.id} value={p.id} disabled={disabled}>
                        {p.label}
                        {disabled ? " (키 필요)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>모델</div>
                <select
                  value={cfg.textModel}
                  onChange={(e) => setCfg((p) => ({ ...p, textModel: e.target.value as any }))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  {textModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* ✅ Claude일 때 Vision fallback 안내 */}
              {isClaudeText ? (
                <div
                  style={{
                    fontSize: 12,
                    color: visionFallbackAvailable ? "#0b5" : "#b42318",
                    background: visionFallbackAvailable ? "#ecfdf3" : "#fef3f2",
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid ${visionFallbackAvailable ? "#b7f7d0" : "#fecaca"}`,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>Vision 분석 처리 방식</div>
                  {visionFallbackAvailable ? (
                    <>
                      Claude 선택 시 <b>Vision(이미지 분석)</b>은 자동으로{" "}
                      <b>{canUseOpenAI ? "OpenAI" : "Gemini"}</b>로 처리돼요.
                      <div style={{ marginTop: 4, color: "#555" }}>
                        (Vision은 안정성을 위해 OpenAI/Gemini로 fallback, 컨셉 선택은 Claude로 진행)
                      </div>
                    </>
                  ) : (
                    <>
                      Claude 선택 시 Vision(이미지 분석)을 위해 <b>OPENAI_API_KEY 또는 GEMINI_API_KEY</b>가 필요해요.
                      <div style={{ marginTop: 4, color: "#555" }}>
                        현재는 두 키가 모두 없어 Vision 단계에서 실패할 수 있습니다.
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          {/* Image Engine */}
          <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Image Engine</div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>AI 종류</div>
                <select
                  value={cfg.imageProvider}
                  onChange={(e) => {
                    const nextProvider = e.target.value as EngineConfig["imageProvider"];
                    const firstModel = firstEnabledImageModel(nextProvider);

                    setCfg((p) =>
                      normalizeEngineConfig({
                        ...p,
                        imageProvider: nextProvider,
                        imageModel: firstModel,
                      })
                    );
                  }}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  {imageProviderOptions.map((p) => {
                    const disabled =
                      (p === "openai" && !canUseImageOpenAI) || (p === "gemini" && !canUseImageGemini);
                    const label = p === "openai" ? "OpenAI" : "Gemini";
                    return (
                      <option key={p} value={p} disabled={disabled}>
                        {label}
                        {disabled ? " (키 필요)" : ""}
                      </option>
                    );
                  })}
                </select>

                <div style={{ fontSize: 12, color: "#666" }}>
                  Claude는 이미지 출력이 불가해서 Image Engine에는 포함되지 않습니다.
                </div>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>모델</div>
                <select
                  value={cfg.imageModel}
                  onChange={(e) => setCfg((p) => ({ ...p, imageModel: e.target.value as any }))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  {imageModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
              }}
            >
              취소
            </button>

            <button
              onClick={() => {
                const normalized = normalizeWithAvailability(cfg, avail);
                storeConfig(normalized);
                onSave(normalized);
                onClose();
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "white",
                fontWeight: 800,
              }}
              // Claude를 쓰는데 Vision fallback 키가 전혀 없으면 저장을 막을지 여부:
              // PoC에서는 막는 게 안전(서버에서 500 나기 때문)
              disabled={isClaudeText && !visionFallbackAvailable}
              title={
                isClaudeText && !visionFallbackAvailable
                  ? "Claude 사용 시 Vision 분석을 위해 OPENAI_API_KEY 또는 GEMINI_API_KEY가 필요합니다."
                  : ""
              }
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
