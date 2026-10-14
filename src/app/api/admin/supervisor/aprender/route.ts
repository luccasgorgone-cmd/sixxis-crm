// Admin: APRENDIZADO do Supervisor (loop de feedback determinístico).
//   GET  → snapshot atual (para a seção "O que a IA aprendeu" do Explicativo).
//   POST → "estudar agora": recomputa o snapshot na hora (determinístico, zero
//          token) e devolve o resultado. Idempotente.
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { carregarAprendizado, estudarAprendizado } from "@/lib/supervisor/aprendizado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  const snap = await carregarAprendizado();
  return NextResponse.json(snap);
}

export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  const snap = await estudarAprendizado(new Date());
  return NextResponse.json({ ok: true, aprendizado: snap });
}
