// Admin > Catalogo > "Casar com a Loja": grava `modelo` (grafia da Loja) e
// `categoria` padronizada nos 12 produtos vendidos no site. Substitui o
// scripts/preencherModeloCatalogo.ts para quem nao tem terminal com DATABASE_URL.
//
//   GET  -> SIMULACAO ("de -> para" dos 12). Nunca grava.
//   POST -> APLICA em $transaction. MESMA trava do script: se algum dos 12 nao
//           casar por nome exato OU houver nome duplicado, responde 409 com a
//           lista e NAO grava NENHUM.
//
// O mapa e a regra vivem em lib/casarLoja (fonte unica com o script).
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { TipoCatalogo } from "@/generated/prisma/enums";
import { NOMES_CASAR_LOJA, MAPA_CASAR_LOJA, simularCasamento } from "@/lib/casarLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Produtos do catalogo cujo nome esta no mapa (nome EXATO, so tipo=PRODUTO).
// PECA e produto fora do mapa nunca entram — nem na simulacao, nem na gravacao.
async function alvos() {
  return prisma.produtoCatalogo.findMany({
    where: { tipo: TipoCatalogo.PRODUTO, nome: { in: NOMES_CASAR_LOJA } },
    select: { id: true, nome: true, modelo: true, categoria: true },
  });
}

// Quando falta alguem, devolvemos tambem os nomes REAIS de PRODUTO do catalogo:
// e assim que o admin descobre a grafia divergente sem abrir o banco.
async function nomesReais() {
  const todos = await prisma.produtoCatalogo.findMany({
    where: { tipo: TipoCatalogo.PRODUTO },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, modelo: true, categoria: true },
  });
  return todos;
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  const sim = simularCasamento(await alvos());
  return NextResponse.json({
    ...sim,
    catalogo: sim.ok ? [] : await nomesReais(),
  });
}

export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  // Re-simula na hora de gravar (nao confia no que a tela viu): o catalogo pode
  // ter mudado entre o GET e o clique.
  const sim = simularCasamento(await alvos());
  if (!sim.ok) {
    return NextResponse.json(
      {
        erro: "catalogo nao casa com a Loja; nada foi gravado",
        ...sim,
        catalogo: await nomesReais(),
      },
      { status: 409 },
    );
  }

  // Update por id (nunca por nome), tudo ou nada.
  await prisma.$transaction(
    sim.linhas.map((l) =>
      prisma.produtoCatalogo.update({
        where: { id: l.id },
        data: {
          modelo: MAPA_CASAR_LOJA[l.nome].modelo,
          categoria: MAPA_CASAR_LOJA[l.nome].categoria,
        },
      }),
    ),
  );

  // Re-simula depois de gravar: a tela recarrega com o estado real (12/12 ok).
  return NextResponse.json({
    aplicados: sim.linhas.length,
    ...simularCasamento(await alvos()),
  });
}
