// SOL-4 B3: motor de envio da recaptacao, em ondas lentas.
//
// Este arquivo manda mensagem para NUMERO REAL de cliente. Tudo aqui e freio.
// A ordem dos portoes, do mais duro ao mais fino:
//
//   1. Existe campanha com status ARMADA? Nao -> nao faz nada. O estado inicial
//      e RASCUNHO e so o dono arma, pelo painel. Deploy/seed nao armam nada.
//   2. Esta dentro do horario? Precisa passar no horario comercial do CRM E na
//      janela fixa deste arquivo (o CRM sem horario configurado responde
//      "sempre aberto", o que para NOTIFICACAO e razoavel e para mensagem fria
//      as 3h da manha nao e).
//   3. Sobrou cota do dia? O slot e RESERVADO antes do envio, com um UPDATE
//      condicional — dois motores em paralelo nao furam o teto.
//   4. O lote e pequeno e cada envio tem jitter de dezenas de segundos. Nunca
//      rajada.
//   5. Freio automatico: erro acima do limiar no lote -> PAUSA a campanha
//      sozinha e registra o motivo.
//
// Reenvio e impedido pelo BANCO (unique campanhaId+leadId), nao por um if.
import type { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { enviarTexto } from "./evolution";
import { nomeEfetivo } from "./cliente";
import { normalizarTexto } from "./format";
import { estaAbertoAgora, normalizarHorarios } from "./horario";
import { registrarSolEvento, ACAO_RECAPTACAO } from "./solEvento";
import {
  etapaEntradaVenda,
  selecionarPublico,
  renderizarMensagem,
  primeiroNomeReal,
} from "./recaptacaoPublico";
import { Prisma } from "@/generated/prisma/client";
import {
  StatusCampanhaRecap,
  StatusRecapEnvio,
  DirecaoMsg,
  TipoMsg,
  StatusEnvio,
} from "@/generated/prisma/enums";

// Cadencia do tick. O tick e barato quando nao ha campanha ARMADA (uma consulta).
const TICK_MS = 60_000;
// Envios por tick. Pequeno de proposito: mesmo com o limite diario alto, a saida
// continua pingada em vez de sair em bloco.
const LOTE_MAX = 5;
// Jitter entre envios — dezenas de segundos, com variacao, para nao desenhar um
// padrao regular de robo.
const JITTER_MIN_MS = 25_000;
const JITTER_MAX_MS = 75_000;
// Freio automatico: proporcao de erro que pausa a campanha.
const LIMIAR_ERRO = 0.2;
// Abaixo disso a amostra e pequena demais para concluir qualquer coisa (1 erro
// em 2 envios daria 50% e pausaria a campanha por acaso).
const MIN_AMOSTRA_FREIO = 3;
// Janela fixa (hora local do fuso do CRM) fora da qual NUNCA se envia, mesmo que
// o horario comercial diga que esta aberto. Piso de seguranca, nao preferencia.
const HORA_MIN = 9;
const HORA_MAX = 20; // exclusivo: as 20h ja nao envia

let rodando = false;

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(): number {
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
}

// Data local (fuso do CRM) como meia-noite UTC — casa com a coluna DATE.
function diaLocal(fuso: string, agora = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return new Date(`${iso}T00:00:00.000Z`);
}

function horaLocal(fuso: string, agora = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: fuso,
      hour: "2-digit",
      hour12: false,
    }).format(agora),
  );
}

async function pausar(campanhaId: string, motivo: string): Promise<void> {
  await prisma.campanhaRecaptacao.update({
    where: { id: campanhaId },
    data: {
      status: StatusCampanhaRecap.PAUSADA,
      pausadaMotivo: motivo,
      pausadaEm: new Date(),
    },
  });
  console.warn(`[recaptacao] campanha ${campanhaId} PAUSADA: ${motivo}`);
  getIO()?.emit("recaptacao:atualizada", { campanhaId });
}

export async function processarRecaptacao(io: Server | null = null): Promise<void> {
  // Um motor por vez: um lote com jitter pode durar mais que o tick.
  if (rodando) return;
  rodando = true;
  try {
    // ---- PORTAO 1: campanha ARMADA pelo dono ----
    const campanha = await prisma.campanhaRecaptacao.findFirst({
      where: { status: StatusCampanhaRecap.ARMADA },
      orderBy: { criadoEm: "asc" },
    });
    if (!campanha) return;

    const cfg = await prisma.configuracaoCRM.findFirst({
      select: { horarios: true, fuso: true },
    });
    const fuso = cfg?.fuso ?? "America/Sao_Paulo";

    // ---- PORTAO 2: horario ----
    const hora = horaLocal(fuso);
    if (hora < HORA_MIN || hora >= HORA_MAX) return;
    if (!estaAbertoAgora(normalizarHorarios(cfg?.horarios), fuso)) return;

    // ---- PORTAO 3: cota do dia (zera na virada) ----
    const hoje = diaLocal(fuso);
    if (
      !campanha.dataContadorDia ||
      campanha.dataContadorDia.getTime() !== hoje.getTime()
    ) {
      await prisma.campanhaRecaptacao.update({
        where: { id: campanha.id },
        data: { enviadosHoje: 0, dataContadorDia: hoje },
      });
      campanha.enviadosHoje = 0;
      campanha.dataContadorDia = hoje;
    }
    const restantes = campanha.limiteDiario - campanha.enviadosHoje;
    if (restantes <= 0) return;

    const lote = Math.min(restantes, LOTE_MAX);

    const etapa = await etapaEntradaVenda();
    if (!etapa) {
      await pausar(campanha.id, "funil de VENDA sem etapa de entrada ativa");
      return;
    }

    // Materializa os proximos candidatos. skipDuplicates + o unique do banco
    // fazem isto ser idempotente: rodar duas vezes nao cria linha repetida.
    const publico = await selecionarPublico(etapa.id);
    if (publico.elegiveis.length > 0) {
      await prisma.recaptacaoEnvio.createMany({
        data: publico.elegiveis.slice(0, lote).map((c) => ({
          campanhaId: campanha.id,
          leadId: c.leadId,
          conversaId: c.conversaId,
          instancia: c.instancia,
          status: StatusRecapEnvio.PENDENTE,
        })),
        skipDuplicates: true,
      });
    }

    const pendentes = await prisma.recaptacaoEnvio.findMany({
      where: { campanhaId: campanha.id, status: StatusRecapEnvio.PENDENTE },
      orderBy: { criadoEm: "asc" },
      take: lote,
      include: {
        lead: {
          select: {
            id: true,
            telefone: true,
            nome: true,
            pushName: true,
            nomeManual: true,
            fotoUrl: true,
            aceitaContato: true,
            bloqueado: true,
            arquivado: true,
          },
        },
      },
    });

    if (pendentes.length === 0) {
      // Sem pendentes e sem candidatos novos: a onda acabou.
      if (publico.elegiveis.length === 0) {
        await prisma.campanhaRecaptacao.update({
          where: { id: campanha.id },
          data: { status: StatusCampanhaRecap.CONCLUIDA },
        });
        getIO()?.emit("recaptacao:atualizada", { campanhaId: campanha.id });
      }
      return;
    }

    let enviados = 0;
    let erros = 0;

    for (let i = 0; i < pendentes.length; i++) {
      const envio = pendentes[i];
      const lead = envio.lead;

      // Ultima checagem antes de gastar o disparo: o cliente pode ter pedido
      // opt-out, sido bloqueado ou arquivado entre a materializacao e agora.
      if (!lead.aceitaContato || lead.bloqueado || lead.arquivado) {
        await prisma.recaptacaoEnvio.update({
          where: { id: envio.id },
          data: {
            status: StatusRecapEnvio.PULADO,
            erro: "lead sem consentimento/bloqueado/arquivado no momento do envio",
          },
        });
        continue;
      }
      if (!envio.instancia || !envio.conversaId) {
        await prisma.recaptacaoEnvio.update({
          where: { id: envio.id },
          data: {
            status: StatusRecapEnvio.PULADO,
            erro: "sem instancia de origem ou conversa — nao adivinhamos numero",
          },
        });
        continue;
      }

      // ---- PORTAO 3 (atomico): RESERVA a vaga antes de enviar ----
      // O UPDATE condicional so passa se a campanha continua ARMADA e a cota do
      // dia ainda tem espaco. Dois motores concorrentes nao furam o teto, e uma
      // pausa feita pelo dono no meio do lote interrompe aqui.
      const reserva = await prisma.campanhaRecaptacao.updateMany({
        where: {
          id: campanha.id,
          status: StatusCampanhaRecap.ARMADA,
          dataContadorDia: hoje,
          enviadosHoje: { lt: campanha.limiteDiario },
        },
        data: { enviadosHoje: { increment: 1 } },
      });
      if (reserva.count === 0) break;

      // ---- PORTAO 4: ritmo ----
      await esperar(jitter());

      const primeiroNome = primeiroNomeReal(lead);
      const texto = renderizarMensagem(campanha.mensagemTemplate, primeiroNome);

      // Sai pela instancia de ORIGEM: o numero que o cliente ja conhece.
      const r = await enviarTexto(lead.telefone, texto, envio.instancia);
      const agora = new Date();

      // Registra a bolha na conversa para o atendimento aparecer no inbox.
      // viaIA = true de proposito: a recaptacao e automatica, nao um humano. Se
      // fosse false, a regra de colisao impediria a Sol de responder quando o
      // cliente voltasse — e a proxima onda excluiria este lead achando que o
      // time ja o atendeu.
      let mensagemId: string | null = null;
      try {
        const msg = await prisma.mensagem.create({
          data: {
            externalId: r.externalId ?? `out-recap-${randomUUID()}`,
            conversaId: envio.conversaId,
            direcao: DirecaoMsg.OUT,
            tipo: TipoMsg.TEXTO,
            conteudo: texto,
            instancia: envio.instancia,
            statusEnvio: r.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO,
            lida: true,
            viaIA: true,
            hora: agora,
          },
        });
        // Guardado para o painel contar entregues/lidas por JOIN, em vez de
        // adivinhar por conversa + horario.
        mensagemId = msg.id;
        await prisma.conversa.update({
          where: { id: envio.conversaId },
          data: { ultimaMensagemEm: agora },
        });
      } catch (e) {
        // Falhar ao registrar a bolha nao pode desfazer o envio ja feito — o
        // RecaptacaoEnvio abaixo continua sendo a verdade sobre o disparo.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
          console.warn(
            `[recaptacao] falha ao registrar mensagem: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      await prisma.recaptacaoEnvio.update({
        where: { id: envio.id },
        data: r.ok
          ? { status: StatusRecapEnvio.ENVIADO, enviadoEm: agora, erro: null, mensagemId }
          : {
              status: StatusRecapEnvio.ERRO,
              erro: JSON.stringify(r.raw ?? {}).slice(0, 500),
              mensagemId,
            },
      });

      // Telemetria: entra no dashboard SOL-2 como acao ATIVA (nao reativa).
      // Sem IA envolvida -> sem custo de modelo.
      await registrarSolEvento(
        envio.conversaId,
        lead.id,
        ACAO_RECAPTACAO,
        r.ok ? `onda "${campanha.nome}"` : `falha de envio na onda "${campanha.nome}"`,
        null,
      );

      (io ?? getIO())?.emit("mensagem:nova", {
        leadId: lead.id,
        leadNome: nomeEfetivo(lead),
        leadFoto: lead.fotoUrl,
        leadTelefone: lead.telefone,
        conversaId: envio.conversaId,
        conteudo: texto,
        direcao: DirecaoMsg.OUT,
        tipo: TipoMsg.TEXTO,
        statusEnvio: r.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO,
        hora: agora,
        naoLidas: 0,
        ultimaMensagemEm: agora,
        viaIA: true,
      });

      if (r.ok) enviados++;
      else erros++;
    }

    // ---- PORTAO 5: freio automatico ----
    // Erro em rajada e o sintoma classico de numero sendo limitado pela Meta.
    // Melhor parar sozinho e avisar do que insistir e perder o numero.
    const tentativas = enviados + erros;
    if (tentativas >= MIN_AMOSTRA_FREIO && erros / tentativas > LIMIAR_ERRO) {
      await pausar(
        campanha.id,
        `freio automatico: ${erros} erro(s) em ${tentativas} envios ` +
          `(${Math.round((erros / tentativas) * 100)}% > ${LIMIAR_ERRO * 100}%). ` +
          `Erro em rajada costuma ser o numero sendo limitado — confira a instancia antes de rearmar.`,
      );
      return;
    }

    if (tentativas > 0) {
      console.log(
        `[recaptacao] onda "${campanha.nome}": ${enviados} enviado(s), ${erros} erro(s)`,
      );
      getIO()?.emit("recaptacao:atualizada", { campanhaId: campanha.id });
    }
  } catch (e) {
    console.error(
      `[recaptacao] falha no ciclo: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    rodando = false;
  }
}

// ===== SOL-4 B4: a resposta do cliente =====

// HOTFIX: antes, TODOS os gatilhos valiam por includes() em qualquer posicao —
// entao "qual o preco pra parar de suar?" continha "parar" e virava opt-out. O
// cliente interessado era descartado. Agora sao tres grupos com regras
// diferentes, do mais restrito ao mais permissivo.

// GRUPO 1a — recusas INEQUIVOCAS: tem verbo de parar entrega ou sao
// multi-palavra sem ambiguidade. Valem em qualquer posicao do texto.
const OPTOUT_FRASE = [
  "para de mandar",
  "parar de mandar",
  "pare de mandar",
  "para de me mandar",
  "para de enviar",
  "parar de enviar",
  "pare de enviar",
  "nao me mande",
  "nao me manda",
  "nao manda mais",
  "nao mande mais",
  "nao envie mais",
  "me remova",
  "descadastr", // pega descadastrar/descadastre/descadastro
  "sair da lista",
  "tirar da lista",
  "nao me perturbe",
  "nao perturbe",
];

// GRUPO 1b — inequivocas COM EXCECAO. Sao frases longas que ainda assim colidem
// com uma frase comum de cliente interessado. A excecao e um lookahead negativo
// estreito, so para a colisao conhecida — nao um relaxamento geral da regra.
const OPTOUT_FRASE_COM_EXCECAO: { re: RegExp; colisao: string }[] = [
  {
    // "nao quero mais O azul, quero o vermelho" e TROCA DE PRODUTO, nao recusa.
    re: /\bnao quero mais\b(?!\s+(o|a|os|as|um|uma|esse|essa|este|esta|desse|dessa|deste|desta|de|do|da|dos|das)\b)/,
    colisao: "nao quero mais o <produto>",
  },
  {
    // "me tira uma duvida" e PERGUNTA — em pt-BR e o comeco tipico de quem quer
    // comprar. Sem esta excecao o hotfix trocaria um falso positivo por outro.
    re: /\bme tir[ae]\b(?!\s+(uma\s+)?duvidas?\b)/,
    colisao: "me tira uma duvida",
  },
  {
    // "nao quero receber em casa, vou buscar" e sobre ENTREGA.
    re: /\bnao quero receber\b(?!\s+(em|no|na|pelo|pela|via|por)\b)/,
    colisao: "nao quero receber em casa",
  },
];

// GRUPO 2 — gatilhos CURTOS e ambiguos: aparecem no meio de frases normais
// ("vou parar", "cancelar minha compra antiga", "vou sair de viagem"). So valem
// quando sao praticamente a mensagem inteira.
const GATILHOS_CURTOS = new Set([
  "parar",
  "pare",
  "sair",
  "remover",
  "cancelar",
  "stop",
]);
// Ate 3 palavras cobre "parar", "quero cancelar", "parar por favor" — e deixa
// fora "tem que cancelar minha compra antiga" (6).
const MAX_PALAVRAS_CURTAS = 3;

// Negativas CURTAS que so valem como opt-out quando sao a mensagem inteira.
// Comparadas por igualdade de proposito: "nao sei", "nao agora", "nao entendi"
// NAO sao recusa definitiva — sao conversa, e a Sol deve atender.
const NEGATIVAS_INTEIRAS = new Set([
  "nao",
  "n",
  "no",
  "nop",
  "nope",
  "negativo",
  "nao obrigado",
  "nao obrigada",
  "nao tenho interesse",
  "sem interesse",
  "nao tenho mais interesse",
]);

// Ordem: do criterio mais restrito ao mais amplo. Nenhum grupo depende do outro,
// entao a ordem e legibilidade, nao correcao.
export function ehOptOut(texto: string): boolean {
  const t = normalizarTexto(texto)
    .replace(/[.!,;:?"'()\[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;

  // Negativa curta que e a mensagem INTEIRA ("nao", "sem interesse").
  if (NEGATIVAS_INTEIRAS.has(t)) return true;

  // Gatilho curto ambiguo, so em mensagem quase inteira ("quero cancelar").
  const palavras = t.split(" ");
  if (
    palavras.length <= MAX_PALAVRAS_CURTAS &&
    palavras.some((p) => GATILHOS_CURTOS.has(p))
  ) {
    return true;
  }

  // Recusa inequivoca em qualquer posicao ("pode parar de mandar mensagem").
  if (OPTOUT_FRASE.some((f) => t.includes(f))) return true;

  // Idem, descontadas as colisoes conhecidas com frases de interesse.
  return OPTOUT_FRASE_COM_EXCECAO.some(({ re }) => re.test(t));
}

export type RespostaRecaptacao = { respondido: boolean; optOut: boolean };

// Chamado pela ingestao a cada mensagem de ENTRADA. Se o lead recebeu uma onda,
// marca a resposta; se o texto e recusa explicita, marca OPTOUT e desliga o
// aceitaContato do lead (o mesmo campo que a selecao de publico ja respeita) —
// nunca mais entra em onda nenhuma.
export async function marcarRespostaRecaptacao(
  leadId: string,
  texto: string,
): Promise<RespostaRecaptacao> {
  try {
    const envio = await prisma.recaptacaoEnvio.findFirst({
      where: {
        leadId,
        // RESPONDIDO tambem entra: quem respondeu antes e depois pede para parar
        // tem que ser atendido do mesmo jeito.
        status: { in: [StatusRecapEnvio.ENVIADO, StatusRecapEnvio.RESPONDIDO] },
      },
      orderBy: { enviadoEm: "desc" },
      select: { id: true, status: true, campanhaId: true },
    });
    if (!envio) return { respondido: false, optOut: false };

    const agora = new Date();
    if (ehOptOut(texto)) {
      // Duas escritas em transacao: marcar o envio sem desligar o consentimento
      // deixaria o lead elegivel para a proxima onda.
      await prisma.$transaction([
        prisma.recaptacaoEnvio.update({
          where: { id: envio.id },
          data: { status: StatusRecapEnvio.OPTOUT, respondidoEm: agora },
        }),
        prisma.lead.update({
          where: { id: leadId },
          data: { aceitaContato: false },
        }),
      ]);
      getIO()?.emit("recaptacao:atualizada", { campanhaId: envio.campanhaId });
      return { respondido: true, optOut: true };
    }

    if (envio.status === StatusRecapEnvio.ENVIADO) {
      await prisma.recaptacaoEnvio.update({
        where: { id: envio.id },
        data: { status: StatusRecapEnvio.RESPONDIDO, respondidoEm: agora },
      });
      getIO()?.emit("recaptacao:atualizada", { campanhaId: envio.campanhaId });
    }
    return { respondido: true, optOut: false };
  } catch (e) {
    // Best-effort: telemetria de recaptacao nunca pode engolir a mensagem do
    // cliente. Em erro, seguimos como se nao houvesse recaptacao — o pior caso
    // e a resposta ser atendida normalmente, que ja e o comportamento desejado.
    console.warn(
      `[recaptacao] falha ao marcar resposta: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { respondido: false, optOut: false };
  }
}

// Agenda o motor. Chamado no boot — mas so age quando ha campanha ARMADA, entao
// subir o servidor nao envia nada por si so.
export function iniciarRecaptacao(io?: Server): void {
  setInterval(() => void processarRecaptacao(io ?? null), TICK_MS);
  console.log(
    "[recaptacao] motor agendado (so envia com campanha ARMADA, dentro do horario e da cota diaria)",
  );
}
