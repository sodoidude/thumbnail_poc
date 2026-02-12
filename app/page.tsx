// app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsModal } from "./components/SettingsModal";
import { defaultConfig, type EngineConfig } from "../lib/modelRegistry";
import { AiRepresentativeImageModal } from "./components/AiRepresentativeImageModal";

const STORAGE_KEY = "windly_thumb_poc_engine_config";

function loadEngineConfig(): EngineConfig {
  if (typeof window === "undefined") return defaultConfig;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig;
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return defaultConfig;
  }
}

type GalleryImage = {
  id: string;
  src: string; // dataUrl or objectUrl
  label?: string; // ex) "대표", "AI 적용"
};

function uid(prefix = "img") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function HomePage() {
  // settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [engineCfg, setEngineCfg] = useState<EngineConfig>(() => loadEngineConfig());

  // product title (PoC input)
  const [title, setTitle] = useState("");

  // representative image source of truth (uploaded)
  const [repFile, setRepFile] = useState<File | null>(null);
  const [repSrc, setRepSrc] = useState<string | null>(null); // objectUrl for uploaded file
  const [repOriginalSrc, setRepOriginalSrc] = useState<string | null>(null); // for comparison (uploaded base)

  // gallery (first is representative)
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // modal
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // status badges
  const repBadges = useMemo(() => {
    const first = images[0];
    if (!first) return [];
    const badges: string[] = ["대표"];
    if (first.label === "AI 적용") badges.push("AI 적용");
    return badges;
  }, [images]);

  // cleanup object URLs
  useEffect(() => {
    return () => {
      if (repSrc?.startsWith("blob:")) URL.revokeObjectURL(repSrc);
      if (repOriginalSrc?.startsWith("blob:")) URL.revokeObjectURL(repOriginalSrc);
      images.forEach((img) => {
        if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetAll() {
    setTitle("");
    setAiModalOpen(false);

    if (repSrc?.startsWith("blob:")) URL.revokeObjectURL(repSrc);
    if (repOriginalSrc?.startsWith("blob:")) URL.revokeObjectURL(repOriginalSrc);

    setRepFile(null);
    setRepSrc(null);
    setRepOriginalSrc(null);

    setImages([]);
    setSelectedIdx(0);
  }

  async function onPickRepresentative(file: File | null) {
    // clear previous
    if (repSrc?.startsWith("blob:")) URL.revokeObjectURL(repSrc);
    if (repOriginalSrc?.startsWith("blob:")) URL.revokeObjectURL(repOriginalSrc);

    setRepFile(file);

    if (!file) {
      setRepSrc(null);
      setRepOriginalSrc(null);
      setImages([]);
      setSelectedIdx(0);
      return;
    }

    const url = URL.createObjectURL(file);

    // representative is first
    setRepSrc(url);
    setRepOriginalSrc(url);

    setImages((prev) => {
      const rest = prev.filter((_, i) => i !== 0);
      return [{ id: uid("rep"), src: url }, ...rest];
    });
    setSelectedIdx(0);
  }

  function applyAiImageToRepresentative(aiDataUrl: string) {
    setImages((prev) => {
      // keep original representative as 2nd slot (if exists / not already)
      const next: GalleryImage[] = [];

      // 1) new representative (AI)
      next.push({ id: uid("ai_rep"), src: aiDataUrl, label: "AI 적용" });

      // 2) original representative for reference
      if (repOriginalSrc) {
        next.push({ id: uid("orig_rep"), src: repOriginalSrc });
      }

      // 3) keep the rest (excluding any duplicates that match src)
      const rest = prev
        .filter((_, i) => i !== 0)
        .filter((img) => img.src !== aiDataUrl && img.src !== repOriginalSrc);

      return [...next, ...rest];
    });

    // 대표 이미지가 AI로 바뀌니, 선택도 첫 슬롯으로 이동
    setSelectedIdx(0);
  }

  const representativeReady = !!repFile && !!repSrc;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 50% -10%, rgba(255,255,255,0.08), transparent 60%), linear-gradient(180deg, #0b0c0f, #07080b)",
        color: "white",
        display: "flex",
      }}
    >
      {/* LNB (기존 유지) */}
      <aside
        style={{
          width: 84,
          borderRight: "1px solid rgba(255,255,255,0.08)",
          padding: "14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <LnbIconButton label="New" onClick={resetAll}>
            ＋
          </LnbIconButton>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />

          <LnbIconButton label="홈" onClick={() => {}}>
            ⌂
          </LnbIconButton>
          <LnbIconButton label="작업" onClick={() => {}}>
            ⟳
          </LnbIconButton>
        </div>

        <div style={{ flex: 1 }} />

        <LnbIconButton label="설정" onClick={() => setSettingsOpen(true)}>
          ⚙︎
        </LnbIconButton>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: "22px 18px 44px" }}>
        {/* Top header (실제 제품 느낌) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>상품 정보 편집</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>이미지</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              Text: {engineCfg.textProvider} / Image: {engineCfg.imageProvider}
            </div>

            <button
              onClick={() => setSettingsOpen(true)}
              style={ghostButtonStyle}
              title="엔진 설정"
            >
              설정
            </button>
          </div>
        </div>

        {/* Content wrapper */}
        <div
          style={{
            marginTop: 16,
            borderRadius: 18,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          {/* Stepper row (가시성만) */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <StepDot active label="기본정보" />
            <StepDot active label="이미지" />
            <StepDot label="옵션" />
            <StepDot label="판매가" />
            <StepDot label="상품속성" />
            <StepDot label="상세페이지" />
            <StepDot label="업로드설정" />
          </div>

          {/* Body grid */}
          <div
            style={{
              padding: 14,
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
            }}
          >
            {/* Left: gallery area */}
            <section
              style={{
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
                overflow: "hidden",
              }}
            >
              {/* Toolbar */}
              <div
                style={{
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>상품이미지</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                    PoC: 대표 이미지를 업로드한 뒤 AI로 차별화할 수 있어요
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button style={ghostButtonStyle} onClick={() => {}} title="(PoC) 이미지 편집 버튼(동작 없음)">
                    이미지 편집
                  </button>

                  <button
                    style={{
                      ...primaryButtonStyle,
                      opacity: representativeReady ? 1 : 0.45,
                      cursor: representativeReady ? "pointer" : "not-allowed",
                    }}
                    onClick={() => {
                      if (!representativeReady) return;
                      setAiModalOpen(true);
                    }}
                    disabled={!representativeReady}
                    title={representativeReady ? "AI 대표이미지 차별화" : "대표 이미지를 먼저 업로드해주세요"}
                  >
                    ✨ AI 대표이미지 차별화
                  </button>
                </div>
              </div>

              {/* Thumb strip */}
              <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                  {/* Representative slot always first */}
                  <Thumb
                    active={selectedIdx === 0}
                    src={images[0]?.src}
                    badges={repBadges}
                    isPlaceholder={!images[0]?.src}
                    onClick={() => setSelectedIdx(0)}
                    onUploadClick={() => {
                      // trigger hidden input
                      const el = document.getElementById("rep-upload") as HTMLInputElement | null;
                      el?.click();
                    }}
                  />

                  {/* Other images (optional) */}
                  {images.slice(1).map((img, idx) => (
                    <Thumb
                      key={img.id}
                      active={selectedIdx === idx + 1}
                      src={img.src}
                      onClick={() => setSelectedIdx(idx + 1)}
                    />
                  ))}
                </div>

                {/* hidden upload input (대표이미지 업로드) */}
                <input
                  id="rep-upload"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => onPickRepresentative(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Main preview */}
              <div style={{ padding: 12 }}>
                <div
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                    minHeight: 420,
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {images[selectedIdx]?.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={images[selectedIdx].src}
                      alt="preview"
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    />
                  ) : (
                    <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
                      <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>
                        대표 이미지를 업로드해주세요
                      </div>
                      <div style={{ marginTop: 6 }}>
                        상단 썸네일의 <b>첫 번째 슬롯</b>에서 업로드할 수 있어요
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Body grid */}
            <div
              style={{
                padding: 14,
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 12,
              }}
            >
              {/* Left: gallery area */}
              <section
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.18)",
                  overflow: "hidden",
                }}
              >
                {/* (이 안 내용은 기존 그대로) */}
                ...
              </section>
            </div>
          </div>
        </div>

        {/* Settings Modal */}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={(cfg) => setEngineCfg(cfg)} />

        {/* AI Representative Image Modal */}
        <AiRepresentativeImageModal
          open={aiModalOpen}
          onClose={() => setAiModalOpen(false)}
          engineCfg={engineCfg}
          productTitle={title}
          onChangeProductTitle={setTitle}
          baseFile={repFile}
          basePreviewSrc={repOriginalSrc}
          onApplied={(aiDataUrl) => {
            applyAiImageToRepresentative(aiDataUrl);
          }}
        />
      </main>
    </div>
  );
}

function StepDot({ label, active }: { label: string; active?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 12, color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)" }}>
        {label}
      </span>
    </div>
  );
}

function Thumb({
  src,
  active,
  badges,
  isPlaceholder,
  onClick,
  onUploadClick,
}: {
  src?: string;
  active?: boolean;
  badges?: string[];
  isPlaceholder?: boolean;
  onClick: () => void;
  onUploadClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 68,
        height: 68,
        borderRadius: 12,
        border: active ? "2px solid rgba(255,255,255,0.9)" : "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.04)",
        overflow: "hidden",
        position: "relative",
        flex: "0 0 auto",
        cursor: "pointer",
      }}
      title={isPlaceholder ? "대표 이미지 업로드" : "미리보기 선택"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="thumb" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.6)",
            fontSize: 11,
            lineHeight: 1.2,
            padding: 8,
            textAlign: "center",
          }}
        >
          <div>
            대표 이미지
            <br />
            업로드
          </div>
        </div>
      )}

      {/* badges */}
      {(badges?.length ?? 0) > 0 ? (
        <div style={{ position: "absolute", left: 6, top: 6, display: "grid", gap: 4 }}>
          {badges!.map((b) => (
            <span
              key={b}
              style={{
                fontSize: 10,
                fontWeight: 900,
                padding: "4px 6px",
                borderRadius: 999,
                background: b === "AI 적용" ? "rgba(255, 204, 0, 0.92)" : "rgba(255,255,255,0.9)",
                color: b === "AI 적용" ? "#111" : "#111",
                width: "fit-content",
              }}
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}

      {/* Upload click affordance on placeholder representative */}
      {isPlaceholder && onUploadClick ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onUploadClick();
          }}
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "end center",
            paddingBottom: 8,
            pointerEvents: "auto",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              padding: "6px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.9)",
              color: "#111",
            }}
          >
            업로드
          </span>
        </div>
      ) : null}
    </button>
  );
}

function LnbIconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        color: "white",
        borderRadius: 14,
        padding: "10px 8px",
        cursor: "pointer",
        display: "grid",
        gap: 6,
        placeItems: "center",
      }}
      title={label}
    >
      <div style={{ fontSize: 18, lineHeight: 1 }}>{children}</div>
      <div style={{ fontSize: 11, opacity: 0.72 }}>{label}</div>
    </button>
  );
}

const ghostButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.9)",
  fontWeight: 800,
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.92)",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.25)",
  color: "white",
  outline: "none",
  fontSize: 14,
};
