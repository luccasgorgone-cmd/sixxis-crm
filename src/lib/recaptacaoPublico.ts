// SOL-4: quem entra numa onda de recaptacao. Esta e a UNICA definicao de
// publico — a previa do painel e o motor de envio chamam a MESMA funcao, para o
// que o dono confere ser exatamente o que vai sair. Se divergissem, a previa
// viraria teatro.
//
// READ-ONLY: nada aqui escreve. Materializar os envios e do motor (B3).
import { prisma } from "./prisma";
import { ehTelefoneValidoBR } from "./ddd";
import { Finalidade, FinalidadeEtapa } from "@/generated/prisma/enums";

// Teto de leitura por varredura. O funil tem ~1.3k candidatos; o teto so existe
// para uma base que cresceu 10x nao virar uma consulta gigante sem querer.
const TETO_VARREDURA = 5000;

export type Candidato = {
  leadId: string;
  telefone: string;
  primeiroNome: string | null;
  conversaId: string;
  instancia: string | null;
};

// Motivo de um lead da etapa cair fora — a previa mostra isso somado, para o
// dono saber POR QUE o publico e menor que o total da coluna.
export type Descarte = "telefone_nao_br" | "sem_instancia";

export type Publico = {
  elegiveis: Candidato[];
  // Leads que a regra encontrou mas nao dao para enviar com seguranca.
  descartes: Record<Descarte, number>;
  // Bateu o teto de varredura (ha mais candidatos do que o lido).
  truncado: boolean;
};

// Etapa de ENTRADA de venda ("Novo"): a ativa de menor ordem no funil de VENDA.
// Resolvida assim, e nao por nome fixo, para acompanhar o funil se ele for
// renomeado.
export async function etapaEntradaVenda(): Promise<{ id: string; nome: string } | null> {
  return prisma.etapa.findFirst({
    where: {
      ativo: true,
      finalidade: { in: [FinalidadeEtapa.VENDA, FinalidadeEtapa.AMBAS] },
    },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

// Primeiro nome REAL do lead, ou null. Diferente de nomeEfetivo (que cai no
// telefone formatado): aqui um telefone nao serve — mandar "Oi 5531..." e pior
// do que uma saudacao neutra.
export function primeiroNomeReal(l: {
  nomeManual?: string | null;
  pushName?: string | null;
  nome?: string | null;
}): string | null {
  const bruto = (l.nomeManual || l.pushName || l.nome || "").trim();
  if (!bruto) return null;
  const primeiro = bruto.split(/\s+/)[0] ?? "";
  // Descarta "nome" que e numero/telefone mascarado e iniciais de uma letra.
  if (primeiro.length < 2) return null;
  if (!/[a-zA-ZÀ-ÿ]/.test(primeiro)) return null;
  if (/\d/.test(primeiro)) return null;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

// Renderiza o template. Suporta {{nome}}; sem nome real, some com o marcador e
// limpa a pontuacao orfa ("Oi {{nome}}, tudo bem?" -> "Oi, tudo bem?").
export function renderizarMensagem(
  template: string,
  primeiroNome: string | null,
): string {
  const bruto = template.replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome ?? "");
  return bruto
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

// O publico da onda.
//
// REGRA (conservadora de proposito — na duvida, NAO envia):
//   - negocio ABERTO na etapa de entrada do funil de VENDA;
//   - lead nao arquivado, nao bloqueado, e com aceitaContato = true (o opt-out
//     que ja existia no Lead — reusado, nao reinventado);
//   - tem conversa de VENDA nao arquivada (e dela sai a instancia de origem);
//   - NENHUM humano ja respondeu nessa conversa. Se alguem do time ja falou com
//     o cliente, ele nao e um lead "parado sem atendimento" — e conversa de
//     gente, e recaptacao automatica atrapalharia;
//   - NUNCA recebeu recaptacao antes, em NENHUMA onda (ENVIADO/RESPONDIDO/
//     OPTOUT). O unique por campanha e a trava dura; isto e a regra global.
// Depois, em JS: telefone BR valido (exclui os @lid) e instancia resolvivel.
export async function selecionarPublico(etapaId: string): Promise<Publico> {
  const linhas = await prisma.$queryRaw<
    {
      leadId: string;
      telefone: string;
      nome: string | null;
      pushName: string | null;
      nomeManual: string | null;
      conversaId: string;
      instancia: string | null;
    }[]
  >`
    SELECT l.id            AS "leadId",
           l.telefone      AS "telefone",
           l.nome          AS "nome",
           l."pushName"    AS "pushName",
           l."nomeManual"  AS "nomeManual",
           c.id            AS "conversaId",
           c.instancia     AS "instancia"
    FROM "Negocio" n
    JOIN "Lead" l     ON l.id = n."leadId"
    JOIN "Conversa" c ON c."leadId" = l.id
                     AND c.finalidade = 'VENDA'::"Finalidade"
                     AND c.arquivada = false
    WHERE n."etapaId" = ${etapaId}
      AND n.finalidade = 'VENDA'::"Finalidade"
      AND n.status = 'ABERTO'::"StatusNeg"
      AND l.arquivado = false
      AND l.bloqueado = false
      AND l."aceitaContato" = true
      AND NOT EXISTS (
        SELECT 1 FROM "RecaptacaoEnvio" r
        WHERE r."leadId" = l.id
          AND r.status IN ('ENVIADO', 'RESPONDIDO', 'OPTOUT')
      )
      AND NOT EXISTS (
        SELECT 1 FROM "Mensagem" m
        WHERE m."conversaId" = c.id
          AND m.direcao = 'OUT'::"DirecaoMsg"
          AND m."viaIA" IS DISTINCT FROM true
      )
    ORDER BY l."criadoEm" ASC
    LIMIT ${TETO_VARREDURA + 1}
  `;

  const truncado = linhas.length > TETO_VARREDURA;
  const lidas = truncado ? linhas.slice(0, TETO_VARREDURA) : linhas;

  const elegiveis: Candidato[] = [];
  const descartes: Record<Descarte, number> = {
    telefone_nao_br: 0,
    sem_instancia: 0,
  };

  for (const l of lidas) {
    // @lid e numero estrangeiro: nao da para enviar com seguranca.
    if (!ehTelefoneValidoBR(l.telefone)) {
      descartes.telefone_nao_br++;
      continue;
    }
    // Sem instancia de origem NAO adivinhamos um numero — o cliente receberia
    // mensagem de um numero que ele nunca viu.
    if (!l.instancia?.trim()) {
      descartes.sem_instancia++;
      continue;
    }
    elegiveis.push({
      leadId: l.leadId,
      telefone: l.telefone,
      primeiroNome: primeiroNomeReal(l),
      conversaId: l.conversaId,
      instancia: l.instancia.trim(),
    });
  }

  return { elegiveis, descartes, truncado };
}

// Finalidade e reexportada para os chamadores nao reimportarem o enum so por
// causa da assinatura acima.
export { Finalidade };
