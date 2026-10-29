// Importador da CARTEIRA DE LEADS (prospeccao B2B por lista).
//
// Idempotente por TELEFONE normalizado (= formato Lead.telefone, via
// normalizarTelefoneBR): o UNIQUE("telefone") no banco garante zero duplicata.
// Reimportar o mesmo contato NAO cria um segundo registro e NAO sobrescreve o
// que o admin ja mexeu (dono, status, vinculo com Lead) — so enriquece campos
// descritivos que estiverem vazios. Nenhuma mensagem e enviada aqui.
import { prisma } from "@/lib/prisma";
import { normalizarTelefoneBR } from "@/lib/phone";
import { CarteiraCategoria } from "@/generated/prisma/enums";

export type ContatoEntrada = {
  telefone: string;
  nome: string;
  uf?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  categoria?: string | null;
  segmento?: string | null;
  notaGoogle?: number | null;
  numAvaliacoes?: number | null;
  score?: number | null;
  classe?: string | null;
  curvaCidade?: string | null;
  emailPublico?: string | null;
  linkFonte?: string | null;
  perfilObs?: string | null;
  // Vendedor dono (distribuicao). So aplicado na CRIACAO — nunca sobrescreve uma
  // reatribuicao que o admin ja fez.
  donoId?: string | null;
};

export type ResultadoImport = {
  loteId: string;
  criados: number;
  atualizados: number;
  pulados: number;
};

const CATEGORIAS = new Set<string>(Object.values(CarteiraCategoria));

function categoriaDe(v: string | null | undefined): CarteiraCategoria {
  const c = (v ?? "").toUpperCase();
  return (CATEGORIAS.has(c) ? c : "OUTRO") as CarteiraCategoria;
}

function limpo(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

// Enriquecimento: so preenche o destino quando ele esta vazio (nao clobbera dado
// ja existente numa reimportacao).
function enriquecer<T>(atual: T | null | undefined, novo: T | null | undefined): T | null {
  if (atual !== null && atual !== undefined && atual !== ("" as unknown as T)) return atual;
  return novo ?? null;
}

export async function importarContatos(
  rows: ContatoEntrada[],
  opts: { loteNome: string; origem?: string | null },
): Promise<ResultadoImport> {
  const lote = await prisma.carteiraLote.create({
    data: { nome: opts.loteNome, origem: opts.origem ?? null },
  });

  let criados = 0;
  let atualizados = 0;
  let pulados = 0;

  for (const r of rows) {
    const telefone = normalizarTelefoneBR(r.telefone);
    // 55 + DDD(2) + 8/9 digitos => 12 ou 13. Fora disso nao e telefone BR valido.
    if (!telefone || telefone.length < 12 || telefone.length > 13) {
      pulados++;
      continue;
    }
    if (!r.nome || !r.nome.trim()) {
      pulados++;
      continue;
    }

    const existente = await prisma.carteiraContato.findUnique({
      where: { telefone },
      select: {
        id: true,
        bairro: true,
        endereco: true,
        segmento: true,
        notaGoogle: true,
        numAvaliacoes: true,
        score: true,
        classe: true,
        curvaCidade: true,
        emailPublico: true,
        linkFonte: true,
        perfilObs: true,
        categoria: true,
      },
    });

    if (!existente) {
      await prisma.carteiraContato.create({
        data: {
          loteId: lote.id,
          telefone,
          nome: r.nome.trim(),
          uf: limpo(r.uf),
          cidade: limpo(r.cidade),
          bairro: limpo(r.bairro),
          endereco: limpo(r.endereco),
          categoria: categoriaDe(r.categoria),
          segmento: limpo(r.segmento),
          notaGoogle: r.notaGoogle ?? null,
          numAvaliacoes: r.numAvaliacoes ?? null,
          score: r.score ?? null,
          classe: limpo(r.classe),
          curvaCidade: limpo(r.curvaCidade),
          emailPublico: limpo(r.emailPublico),
          linkFonte: limpo(r.linkFonte),
          perfilObs: limpo(r.perfilObs),
          donoId: r.donoId ?? null,
        },
      });
      criados++;
    } else {
      // Enriquece apenas campos descritivos vazios. NAO toca donoId/status/leadId
      // (preserva reatribuicao/ativacao feita depois do primeiro import). Promove
      // categoria OUTRO -> categoria real se a nova fonte trouxer uma concreta.
      const novaCat = categoriaDe(r.categoria);
      await prisma.carteiraContato.update({
        where: { id: existente.id },
        data: {
          loteId: lote.id,
          bairro: enriquecer(existente.bairro, limpo(r.bairro)),
          endereco: enriquecer(existente.endereco, limpo(r.endereco)),
          segmento: enriquecer(existente.segmento, limpo(r.segmento)),
          notaGoogle: existente.notaGoogle ?? r.notaGoogle ?? null,
          numAvaliacoes: existente.numAvaliacoes ?? r.numAvaliacoes ?? null,
          score: existente.score ?? r.score ?? null,
          classe: enriquecer(existente.classe, limpo(r.classe)),
          curvaCidade: enriquecer(existente.curvaCidade, limpo(r.curvaCidade)),
          emailPublico: enriquecer(existente.emailPublico, limpo(r.emailPublico)),
          linkFonte: enriquecer(existente.linkFonte, limpo(r.linkFonte)),
          perfilObs: enriquecer(existente.perfilObs, limpo(r.perfilObs)),
          categoria:
            existente.categoria === "OUTRO" && novaCat !== "OUTRO" ? novaCat : existente.categoria,
        },
      });
      atualizados++;
    }
  }

  await prisma.carteiraLote.update({
    where: { id: lote.id },
    data: { totalImportado: criados + atualizados },
  });

  return { loteId: lote.id, criados, atualizados, pulados };
}
