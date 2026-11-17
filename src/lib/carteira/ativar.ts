// Ativacao de um contato da CARTEIRA DE LEADS: o vendedor abre a conversa com o
// prospecto. Aqui esta o ponto delicado que o SPEC marcou:
//
// A regra viva da ingestao diz que mensagem de SAIDA (OUT) NAO cria/roteia
// negocio (correcao do bug de campanha de reativacao). Mas prospeccao e
// EXATAMENTE o vendedor mandando a 1a mensagem, e isso PRECISA criar o card.
// Resolucao: a ativacao e uma ACAO HUMANA DELIBERADA e chama
// garantirNegocioParaLead DIRETO (como "iniciar conversa pelo admin" ja faz) —
// nao passa pela regra OUT da ingestao. garantirNegocioParaLead e dedup-safe
// (um lead+finalidade = no maximo um negocio, reusa PERDIDO/GANHO), entao
// reativar um prospecto que ja foi cliente NAO duplica card.
//
// Dedup de cliente: o Lead e casado/criado por telefone (Lead.telefone @unique,
// mesma normalizacao). Se ja existe Lead com aquele numero, REUSA — nunca cria
// um segundo. O vinculo CarteiraContato.leadId (@unique) fecha o 1:1.
import { prisma } from "@/lib/prisma";
import { Finalidade } from "@/generated/prisma/enums";
import { normalizarTelefoneBR, variantesTelefoneBR } from "@/lib/phone";
import { garantirConversaUnificada } from "@/lib/conversa";
import { garantirNegocioParaLead } from "@/lib/negocio";
import { nomeBuscaDe } from "@/lib/cliente";
import { decidirCadastroDuplicado } from "@/lib/dedupCadastro";

export type ResultadoAtivacao = {
  ok: true;
  leadId: string;
  conversaId: string;
  negocioId: string | null;
  reusouLead: boolean;
};

// Lancado quando o numero do contato ja pertence a OUTRO vendedor no sistema.
// A carteira era o UNICO caminho de criacao de Lead que ainda escapava da trava
// de duplicata (o cadastro manual /api/leads ja bloqueava desde 03/11) e, pior,
// usava match EXATO de telefone — por isso DUPLICAVA o card para um segundo
// vendedor (frente 7, pedido do Luccas). A rota de ativacao mapeia este erro
// para HTTP 403 com o nome do dono atual.
export class ConflitoCarteiraOutroVendedor extends Error {
  readonly leadId: string;
  readonly donoId: string | null;
  readonly donoNome: string | null;
  constructor(donoNome: string | null, leadId: string, donoId: string | null) {
    super(
      donoNome
        ? `Este cliente ja esta no sistema e pertence a ${donoNome}. Peca a um admin para reatribuir.`
        : "Este cliente ja esta no sistema e pertence a outro vendedor. Peca a um admin para reatribuir.",
    );
    this.name = "ConflitoCarteiraOutroVendedor";
    this.leadId = leadId;
    this.donoId = donoId;
    this.donoNome = donoNome;
  }
}

export async function ativarContato(
  contatoId: string,
  agenteId: string,
  opts: { instanciaId?: string | null; ehAdmin?: boolean },
): Promise<ResultadoAtivacao> {
  const contato = await prisma.carteiraContato.findUnique({
    where: { id: contatoId },
    select: {
      id: true,
      telefone: true,
      nome: true,
      uf: true,
      cidade: true,
      bairro: true,
      endereco: true,
      emailPublico: true,
      leadId: true,
    },
  });
  if (!contato) throw new Error("contato nao encontrado");

  const telefone = normalizarTelefoneBR(contato.telefone);

  // 1) Lead por telefone: busca TOLERANTE a variante (com/sem o 9o digito,
  // com/sem o DDI 55) — igual ao cadastro manual (/api/leads). Antes era
  // findUnique EXATO: o MESMO cliente ja ingerido noutra forma ("5518999..." vs
  // "18999...") escapava, caia no create e nascia um SEGUNDO Lead com dono = o
  // vendedor que ativava — a DUPLICATA cross-vendedor relatada (frente 7). A
  // carteira e sempre VENDA, entao o dono da finalidade e Lead.donoId.
  const existentes = await prisma.lead.findMany({
    where: { telefone: { in: variantesTelefoneBR(telefone) } },
    select: { id: true, donoId: true },
  });
  // Lead canonico: prefere um que JA tenha dono (o dono manda na trava); senao o
  // primeiro. Deterministico quando ha mais de um casando por variante (legado).
  const existente =
    existentes.find((l) => l.donoId != null) ?? existentes[0] ?? null;

  let leadId: string;
  let reusouLead: boolean;
  if (existente) {
    // TRAVA cross-vendedor (frente 7): numero que ja pertence a OUTRO vendedor
    // nao pode ser ativado por vendedor comum — BLOQUEIA com aviso de quem e o
    // dono; so admin reatribui (transferencia de carteira). Mesma regra PURA do
    // cadastro manual (decidirCadastroDuplicado, contrato c17) — um ponto de
    // decisao so para os dois caminhos nao divergirem de novo.
    const decisao = decidirCadastroDuplicado({
      existe: true,
      donoFinalidade: existente.donoId,
      requesterId: agenteId,
      ehAdmin: opts.ehAdmin === true,
    });
    if (decisao.acao === "ASSUMIR" && decisao.bloqueado) {
      const dono = existente.donoId
        ? await prisma.agente.findUnique({
            where: { id: existente.donoId },
            select: { nome: true },
          })
        : null;
      throw new ConflitoCarteiraOutroVendedor(
        dono?.nome ?? null,
        existente.id,
        existente.donoId,
      );
    }

    reusouLead = true;
    leadId = existente.id;
    // So assume a posse se o lead estava sem dono (nunca rouba um lead ja de
    // outro vendedor — isso seria uma transferencia, acao separada).
    if (!existente.donoId) {
      await prisma.lead.update({ where: { id: leadId }, data: { donoId: agenteId } });
    }
  } else {
    reusouLead = false;
    const nomeBusca = nomeBuscaDe({ nomeManual: contato.nome, pushName: null, nome: null, telefone });
    const lead = await prisma.lead.create({
      data: {
        telefone,
        nome: contato.nome,
        nomeBusca,
        email: contato.emailPublico ?? null,
        empresa: contato.nome,
        origem: "prospeccao",
        donoId: agenteId,
      },
      select: { id: true },
    });
    leadId = lead.id;

    // Enriquece o registro do cliente com o endereco da lista (pedido do Luccas:
    // "se tiver info a mais ja coloque no registro"). So no lead NOVO, so se
    // houver endereco — nao polui cliente ja existente.
    if (contato.endereco || contato.cidade || contato.uf) {
      await prisma.endereco.create({
        data: {
          leadId,
          apelido: "Prospecção",
          logradouro: contato.endereco ?? null,
          bairro: contato.bairro ?? null,
          cidade: contato.cidade ?? null,
          uf: contato.uf ?? null,
          principal: true,
        },
      });
    }
  }

  // 2) Conversa unificada de VENDA com o numero escolhido pelo vendedor.
  const conversa = await garantirConversaUnificada(leadId, Finalidade.VENDA, {
    instanciaId: opts.instanciaId ?? null,
  });
  if (opts.instanciaId) {
    await prisma.conversa.update({
      where: { id: conversa.id },
      // instanciaRespostaId = numero FIXADO para responder (o que o vendedor
      // escolheu). instanciaId = o numero da conversa.
      data: { instanciaId: opts.instanciaId, instanciaRespostaId: opts.instanciaId },
    });
  }

  // 3) Negocio (acao humana deliberada; dedup-safe).
  const negocioId = await garantirNegocioParaLead(leadId, Finalidade.VENDA, true, false);

  // 4) Liga o contato ao funil vivo + marca em abordagem + auditoria.
  await prisma.$transaction([
    prisma.carteiraContato.update({
      where: { id: contato.id },
      data: {
        leadId,
        conversaId: conversa.id,
        status: "EM_ABORDAGEM",
        ativadoEm: contato.leadId ? undefined : new Date(),
      },
    }),
    prisma.carteiraAtividade.create({
      data: {
        contatoId: contato.id,
        agenteId,
        tipo: "ATIVOU",
        detalhe: reusouLead ? "lead reusado" : "lead novo",
      },
    }),
  ]);

  return { ok: true, leadId, conversaId: conversa.id, negocioId, reusouLead };
}
