// Sandbox da Luna (SO ADMIN): chama o motor com a config atual + base de
// conhecimento e devolve a decisao. PURAMENTE EFEMERO: nao grava mensagem, nao
// envia WhatsApp, nao cria lead, nao aciona nenhum worker. So para o dono testar
// as personas e as travas no admin. (Fatia 2.48-A — sem WhatsApp real.)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import {
  gerarRespostaLuna,
  type LunaFinalidade,
  type LunaMensagem,
} from "@/lib/luna";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORICO = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: { finalidade?: unknown; historico?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const finalidade: LunaFinalidade =
    body.finalidade === "POS_VENDA" ? "POS_VENDA" : "VENDA";

  // Sanitiza o historico: so autores validos, texto string, limite de tamanho.
  const brutoHist = Array.isArray(body.historico) ? body.historico : [];
  const historico: LunaMensagem[] = brutoHist
    .slice(0, MAX_HISTORICO)
    .map((m): LunaMensagem | null => {
      if (!m || typeof m !== "object") return null;
      const o = m as Record<string, unknown>;
      const autor = o.autor === "luna" ? "luna" : "cliente";
      const texto = typeof o.texto === "string" ? o.texto : "";
      if (!texto.trim()) return null;
      return { autor, texto: texto.slice(0, 4000) };
    })
    .filter((m): m is LunaMensagem => m !== null);

  if (historico.length === 0) {
    return NextResponse.json(
      { erro: "historico vazio (envie ao menos uma mensagem do cliente)" },
      { status: 400 },
    );
  }

  // Config singleton + base de conhecimento como catalogo. Nao grava nada.
  const config = await prisma.configAgenteIA.findFirst();
  if (!config) {
    return NextResponse.json(
      { erro: "configuracao da IA nao encontrada" },
      { status: 400 },
    );
  }

  const resultado = await gerarRespostaLuna({
    finalidade,
    historico,
    config: {
      modelo: config.modelo,
      promptSistema: config.promptSistema,
      maxMensagensAntesHandoff: config.maxMensagensAntesHandoff,
    },
    catalogo: config.baseConhecimento ?? "",
  });

  return NextResponse.json(resultado);
}
