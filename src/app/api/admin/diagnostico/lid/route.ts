// DIAGNOSTICO (temporario, Fatia 2.37 Parte A). Admin-gated. NAO grava nada.
// Objetivo: descobrir como a Evolution mapeia @lid (numero mascarado) -> telefone
// real. Pega ate 10 leads cujo "telefone" NAO tem cara de telefone BR valido
// (provavel @lid) e, para cada instancia ativa, chama dois endpoints da Evolution
// devolvendo a resposta CRUA de cada um (pra vermos o shape do mapeamento).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { baseEKey } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telefone BR valido (heuristica local, so pra separar os provaveis @lid): so
// digitos, comeca com "55" e tem 12-13 digitos no total (55 + DDD + 8/9).
function pareceTelefoneBR(tel: string): boolean {
  const d = (tel ?? "").replace(/\D/g, "");
  return /^55\d{10,11}$/.test(d);
}

// Chama um endpoint da Evolution e devolve o resultado CRU (nunca lanca).
async function chamar(
  base: string,
  apikey: string,
  caminho: string,
  body: unknown,
): Promise<{ endpoint: string; status: number | null; raw: unknown }> {
  const url = `${base}${caminho}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify(body),
    });
    const raw = await resp.json().catch(() => null);
    return { endpoint: caminho, status: resp.status, raw };
  } catch (erro) {
    return {
      endpoint: caminho,
      status: null,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const cfg = baseEKey();
  if (!cfg) {
    return NextResponse.json(
      { erro: "config Evolution ausente" },
      { status: 200 },
    );
  }

  // Amostra: pega um lote e filtra em JS os que NAO parecem telefone BR valido.
  const lote = await prisma.lead.findMany({
    orderBy: { criadoEm: "desc" },
    take: 2000,
    select: { id: true, telefone: true, pushName: true, nome: true },
  });
  const amostra = lote
    .filter((l) => !pareceTelefoneBR(l.telefone))
    .slice(0, 10);

  const numeros = amostra.map((l) => l.telefone.replace(/\D/g, ""));

  const instancias = await prisma.instanciaWhatsApp.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, instanciaEvolution: true },
  });

  const porInstancia = await Promise.all(
    instancias.map(async (i) => {
      const inst = i.instanciaEvolution;
      const [findContacts, whatsappNumbers] = await Promise.all([
        chamar(cfg.base, cfg.apikey, `/chat/findContacts/${inst}`, {}),
        chamar(cfg.base, cfg.apikey, `/chat/whatsappNumbers/${inst}`, {
          numbers: numeros,
        }),
      ]);
      return { instancia: i.nome, instanciaEvolution: inst, findContacts, whatsappNumbers };
    }),
  );

  return NextResponse.json({
    aviso: "Diagnostico temporario (Fatia 2.37 A). Nenhuma escrita no banco.",
    amostraLeads: amostra,
    numerosTestados: numeros,
    porInstancia,
  });
}
