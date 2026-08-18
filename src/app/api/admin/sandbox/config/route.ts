// Sandbox de Atendimento — config editavel AO VIVO pelo Luccas (prompt extra +
// override opcional de provider/modelo). NUNCA le nem escreve ConfigAgenteIA
// (a config real do atendimento). Singleton, como ConfigAgenteIA.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { garantirProvidersRegistrados } from "@/lib/llmProviders/registro";
import { providersRegistrados } from "@/lib/llmProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  const config = await prisma.sandboxConfig.findFirst();
  return NextResponse.json({ config: config ?? null });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  let body: { promptSistemaExtra?: unknown; provider?: unknown; modelo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  garantirProvidersRegistrados();
  const providerValido =
    typeof body.provider === "string" && providersRegistrados().includes(body.provider)
      ? body.provider
      : null;

  const existente = await prisma.sandboxConfig.findFirst();
  const data = {
    promptSistemaExtra:
      typeof body.promptSistemaExtra === "string" ? body.promptSistemaExtra.slice(0, 8000) : null,
    provider: providerValido,
    modelo: typeof body.modelo === "string" && body.modelo.trim() ? body.modelo.trim() : null,
  };

  const config = existente
    ? await prisma.sandboxConfig.update({ where: { id: existente.id }, data })
    : await prisma.sandboxConfig.create({ data });

  return NextResponse.json({ config });
}
