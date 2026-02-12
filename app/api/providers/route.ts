// app/api/providers/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  return NextResponse.json({
    openai,
    gemini,
    anthropic,
  });
}
