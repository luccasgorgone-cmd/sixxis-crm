// Admin: visao de saude da Evolution. Base URL MASCARADA + status de cada
// instancia (connectionState). Nunca expoe apikey/secret.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { estadoConexao } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mascarar(url: string): string {
  if (!url) return "(nao configurada)";
  if (url.length <= 16) return `${url.slice(0, 4)}****`;
  return `${url.slice(0, 12)}${"*".repeat(6)}${url.slice(-6)}`;
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const baseUrl = mascarar(process.env.EVOLUTION_BASE_URL ?? "");
  const temApiKey = Boolean(process.env.EVOLUTION_API_KEY);

  const instancias = await prisma.instanciaWhatsApp.findMany({
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      nome: true,
      instanciaEvolution: true,
      numero: true,
      finalidade: true,
      ativo: true,
    },
  });

  // Atualiza o status de conexao de cada instancia (best-effort).
  const comStatus = await Promise.all(
    instancias.map(async (i) => {
      const estado = await estadoConexao(i.instanciaEvolution);
      await prisma.instanciaWhatsApp
        .update({ where: { id: i.id }, data: { statusConexao: estado } })
        .catch(() => undefined);
      return { ...i, statusConexao: estado };
    }),
  );

  return NextResponse.json({ baseUrl, temApiKey, instancias: comStatus });
}
