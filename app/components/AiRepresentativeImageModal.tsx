"use client";

import { useMemo, useState } from "react";
import type { EngineConfig } from "../../lib/modelRegistry";

type Props = {
  open: boolean;
  onClose: () => void;
  engineCfg: EngineConfig;

  productTitle: string;
  onChangeProductTitle: (v: string) => void;

  baseFile: File | null;
  basePreviewSrc: string | null;

  onApplied: (aiDataUrl: string) => void;
};

export function AiRepresentativeImageModal(props: Props) {
  const {
    open,
    onClose,
    engineCfg,
    productTitle,
    onChangeProductTitle,
    baseFile,
    basePreviewSrc,
    onApplied,
  } = props;

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [conceptUsed, setConceptUsed] = useState<string | null>(null);
  const [resultB64, setResultB64] = useState<string | null>(null);

  const afterDataUrl = useMemo(() => {
    if (!resultB64) return null;
    return `data:image/png;base64,${resultB64}`;
  }, [resultB64]);

  const canGenerate = !!baseFile && productTitle.trim().length > 0 && !loading;

  if (!open) return null;

  async function onGenerate() {
    try {
      setLoading(true);
      setErrorMsg(null);
      setResultB64(null);
      setConceptUsed(null);

      if (!productTitle.trim()) throw new Error("상품명을 입력해주세요.");
      if (!baseFile) throw new Error("대표 이미지를 업로드해주세요.");

      const fd = new FormData();
      fd.append("title", productTitle.trim());
      fd.append("concept", prompt.trim());
      fd.append("image", baseFile);
      fd.append("engineConfig", JSON.stringify(engineCfg));

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || "생성 실패");

      setConceptUsed(json?.concept_used || null);
      setResultB64(json?.image_base64 || null);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!afterDataUrl) return;
    onApplied(afterDataUrl);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1000px, 100%)",
          // ✅ 모바일에서 vh 튀는 문제 방지: svh 사용(지원 안되면 90vh로 fallback)
          maxHeight: "90svh",
          display: "flex",
          flexDirection: "column",
          background: "#14161c",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 30px 100px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flex: "0 0 auto",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>AI 대표이미지 차별화</div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "white", fontSize: 18, cursor: "pointer" }}
            aria-label="close"
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* Body (스크롤 영역) */}
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0, // ✅ flex 스크롤 안정화(이거 없으면 Footer가 밀리거나 잘리는 케이스가 생김)
            overflowY: "auto",
            padding: 16,
            display: "grid",
            gap: 20,
          }}
        >
          {/* 상품명 */}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>상품명</div>
            <input
              value={productTitle}
              onChange={(e) => onChangeProductTitle(e.target.value)}
              placeholder="PoC용 상품명을 입력해주세요"
              style={inputStyle}
            />
          </div>

          {/* 프롬프트 */}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>대표 이미지 차별화 요청</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="예: 프리미엄 무드, 자연광, 배경 흐림, 제품 중앙 강조"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* 비교 영역 */}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>이미지 비교</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <CompareBox title="기존 대표 이미지" src={basePreviewSrc} />
              <CompareBox title="AI 생성 이미지" src={afterDataUrl} />
            </div>

            {conceptUsed && (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>적용 컨셉: {conceptUsed}</div>
            )}

            {errorMsg && (
              <div style={{ marginTop: 10, color: "rgba(255,120,120,1)" }}>{errorMsg}</div>
            )}
          </div>
        </div>

        {/* Footer (항상 보이도록 sticky) */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flex: "0 0 auto",
            position: "sticky",
            bottom: 0,
            background: "#14161c",
          }}
        >
          <button onClick={onClose} style={ghostButton}>
            취소
          </button>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={onGenerate}
              disabled={!canGenerate}
              style={{
                ...ghostButton,
                opacity: canGenerate ? 1 : 0.5,
                cursor: canGenerate ? "pointer" : "not-allowed",
              }}
              title={canGenerate ? "생성하기" : "대표 이미지 업로드 + 상품명 입력이 필요해요"}
            >
              {loading ? "생성 중..." : "생성하기"}
            </button>

            <button
              onClick={handleApply}
              disabled={!afterDataUrl || loading}
              style={{
                ...primaryButton,
                opacity: !afterDataUrl || loading ? 0.5 : 1,
                cursor: !afterDataUrl || loading ? "not-allowed" : "pointer",
              }}
              title={afterDataUrl ? "이 이미지로 적용하기" : "먼저 생성해주세요"}
            >
              이 이미지로 적용하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareBox({ title, src }: { title: string; src: string | null }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        padding: 10,
        background: "rgba(255,255,255,0.03)",
        minHeight: 260,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>{title}</div>

      <div
        style={{
          height: 220,
          display: "grid",
          placeItems: "center",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6 }}>이미지가 여기에 표시됩니다</div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.3)",
  color: "white",
  fontSize: 14,
};

const ghostButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  cursor: "pointer",
};

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "white",
  color: "black",
  fontWeight: 700,
  cursor: "pointer",
};
