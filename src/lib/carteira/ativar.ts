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
import { normalizarTelefoneBR } from "@/lib/phone";
import { garantirConversaUnificada } from "@/lib/conversa";
import { garantirNegocioParaLead } from "@/lib/negocio";
import { nomeBuscaDe } from "@/lib/cliente";

export type ResultadoAtivacao = {
  ok: true;
  leadId: string;
  conversaId: string;
  negocioId: string | null;
  reusouLead: boolean;
};

export async function ativarContato(
  contatoId: string,
  agenteId: string,
  opts: { instanciaId?: string | null },
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

  // 1) Lead por telefone: reusa o existente (nunca duplica) ou cria.
  const existente = await prisma.lead.findUnique({
    where: { telefone },
    select: { id: true, donoId: true },
  });

  let leadId: string;
  let reusouLead: boolean;
  if (existente) {
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
