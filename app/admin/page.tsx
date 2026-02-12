// app/admin/page.tsx
import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

// Prisma include 결과 타입을 정확히 고정 (=> sum/it/map 콜백 암묵적 any 방지)
type LogRow = Prisma.RequestLogGetPayload<{
  include: { lineItems: true };
}>;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key = "" } = await searchParams;
  const adminKey = process.env.ADMIN_KEY ?? "";

  // 1) 인증
  if (!adminKey || key !== adminKey) {
    return (
      <main style={styles.page}>
        <h1 style={styles.h1}>접근 불가</h1>
        <p style={styles.p}>올바른 admin key가 필요합니다.</p>
        <p style={styles.hint}>예: /admin?key=YOUR_ADMIN_KEY</p>
      </main>
    );
  }

  // 2) 최근 요청 조회
  const logs: LogRow[] = await prisma.requestLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { lineItems: true },
  });

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Windly 썸네일 PoC · Admin</h1>
          <div style={styles.sub}>최근 요청 {logs.length}건 (최대 50건)</div>
        </div>
      </header>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>시간</th>
              <th style={styles.th}>상품명</th>
              <th style={styles.th}>성공</th>
              <th style={styles.th}>Text 모델</th>
              <th style={styles.th}>Image 모델</th>
              <th style={styles.th}>Latency</th>
              <th style={styles.th}>Tokens</th>
              <th style={styles.th}>비용($)</th>
              <th style={styles.th}>Stage 비용</th>
              <th style={styles.th}>에러</th>
            </tr>
          </thead>

          <tbody>
            {logs.map((log) => {
              // ✅ tokens 합산 (sum/it 타입 문제 없음)
              const totalTokens = log.lineItems.reduce(
                (sum: number, it: LogRow["lineItems"][number]) =>
                  sum + (it.totalTokens ?? 0),
                0
              );

              // ✅ stage별 비용 요약
              const stageCostMap = log.lineItems.reduce(
                (acc: Record<string, number>, it: LogRow["lineItems"][number]) => {
                  const k = it.stage || "UNKNOWN";
                  acc[k] = (acc[k] ?? 0) + (it.costUsd ?? 0);
                  return acc;
                },
                {}
              );

              const stageCostText =
                Object.keys(stageCostMap).length === 0
                  ? "-"
                  : Object.entries(stageCostMap)
                      .sort((a, b) => b[1] - a[1])
                      .map(([stage, cost]) => `${stage}:${cost.toFixed(4)}`)
                      .join(" · ");

              const hasError = !log.success && !!log.errorMessage;

              return (
                <tr key={log.id} style={hasError ? styles.trError : undefined}>
                  <td style={styles.td}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 800 }}>{log.title}</div>
                    {log.userConcept ? (
                      <div style={styles.mini}>userConcept: {log.userConcept}</div>
                    ) : null}
                    {log.conceptUsed ? (
                      <div style={styles.mini}>conceptUsed: {log.conceptUsed}</div>
                    ) : null}
                  </td>
                  <td style={styles.td}>{log.success ? "✅" : "❌"}</td>
                  <td style={styles.td}>
                    {log.textProvider}/{log.textModel}
                  </td>
                  <td style={styles.td}>
                    {log.imageProvider}/{log.imageModel}
                  </td>
                  <td style={styles.td}>{log.latencyMs} ms</td>
                  <td style={styles.td}>{totalTokens}</td>
                  <td style={styles.td}>{log.totalCostUsd.toFixed(4)}</td>
                  <td style={styles.td}>
                    <span style={styles.mono}>{stageCostText}</span>
                  </td>
                  <td style={{ ...styles.td, ...(hasError ? styles.errText : undefined) }}>
                    {log.errorMessage || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer style={styles.footer}>
        <div style={styles.hint}>
          인증 URL: <span style={styles.mono}>/admin?key=ADMIN_KEY</span> · env:{" "}
          <span style={styles.mono}>ADMIN_KEY</span>
        </div>
      </footer>
    </main>
  );
}

const styles: Record<string, any> = {
  page: {
    maxWidth: 1400,
    margin: "24px auto",
    padding: 16,
    fontFamily: "system-ui",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  h1: { margin: 0, fontSize: 22, fontWeight: 900 },
  sub: { marginTop: 6, color: "#666", fontSize: 13 },

  tableWrap: {
    marginTop: 16,
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "hidden",
    background: "white",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  td: {
    padding: 10,
    borderBottom: "1px solid #f1f1f1",
    verticalAlign: "top",
  },
  mini: { marginTop: 4, color: "#666", fontSize: 12, lineHeight: 1.3 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  trError: { background: "#fff5f5" },
  errText: { color: "#b00020", fontWeight: 800 },

  p: { margin: "10px 0 0", fontSize: 14 },
  hint: { margin: "10px 0 0", color: "#666", fontSize: 13 },

  footer: { marginTop: 14 },
};
