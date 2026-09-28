// F2 — adaptador de ENVIO do canal Evolution.
//
// Embrulha as funcoes de evolution.ts (enviarTexto/enviarAudio/enviarMidia/
// enviarContato) traduzindo a SaidaCanonica -> chamada da API e o resultado da
// Evolution -> ResultadoEnvioCanonico. Comportamento IDENTICO ao envio direto de
// hoje: mesma URL/headers/corpo, mesma extracao de externalId. A diferenca e so
// o formato de entrada (canonico) e de saida (canonico), para a fachada
// enviarPeloCanal poder escolher entre este e o CloudApiAdapter por conta.
//
// O parser de ENTRADA (parseEventoEvolution) vive em queue.ts (usa helpers
// privados de ingestao); este modulo cobre so a saida.
import {
  enviarTexto,
  enviarAudio,
  enviarMidia,
  enviarContato,
} from "../evolution";
import type {
  CanalAdapterEnvio,
  CapacidadesCanal,
  ContaCanal,
  IdentidadeExterna,
  ResultadoEnvioCanonico,
  SaidaCanonica,
} from "./tipos";

// A Evolution (nao oficial) nao tem janela de 24h nem template obrigatorio.
export const capacidadesEvolution: CapacidadesCanal = {
  texto: true,
  midia: true,
  audioPTT: true,
  reacao: true,
  edicao: true,
  revogar: true,
  contato: true,
  exigeTemplateForaDaJanela: false,
};

// Resultado bruto das funcoes de evolution.ts (type interno nao exportado).
type ResultadoEvolution = {
  ok: boolean;
  externalId?: string;
  status?: number;
  raw: unknown;
};

function mapearResultado(r: ResultadoEvolution): ResultadoEnvioCanonico {
  if (r.ok) return { ok: true, externalId: r.externalId, raw: r.raw };
  const erroRaw =
    typeof r.raw === "object" && r.raw !== null
      ? String((r.raw as { erro?: unknown }).erro ?? "")
      : "";
  const configAusente = erroRaw.includes("config Evolution ausente");
  const motivo = configAusente
    ? "CONFIG_AUSENTE"
    : r.status
      ? "RECUSADO_PELO_CANAL"
      : "ERRO_TRANSITORIO";
  return {
    ok: false,
    motivo,
    detalhe: erroRaw || (r.status ? `status ${r.status}` : undefined),
    raw: r.raw,
  };
}

const RECUSA_SEM_CONTEUDO: ResultadoEnvioCanonico = {
  ok: false,
  motivo: "RECUSADO_PELO_CANAL",
  detalhe: "saida sem conteudo para o tipo informado",
};

async function enviar(
  conta: ContaCanal,
  destino: IdentidadeExterna,
  saida: SaidaCanonica,
): Promise<ResultadoEnvioCanonico> {
  const instancia = conta.refExterna;
  const numero = destino.telefone ?? destino.valor;

  switch (saida.tipo) {
    case "TEXTO": {
      if (!saida.texto) return RECUSA_SEM_CONTEUDO;
      // Quote: a Evolution cita por key { id, remoteJid, fromMe }. remoteJid do
      // destino em chat 1:1 e <numero>@s.whatsapp.net; fromMe=false (citando o
      // cliente). Sem citarExternalId, envio simples.
      const quoted = saida.citarExternalId
        ? {
            id: saida.citarExternalId,
            remoteJid: `${numero}@s.whatsapp.net`,
            // fromMe reflete se a mensagem CITADA e nossa (OUT) — identico ao
            // que os chamadores calculavam antes da fachada.
            fromMe: saida.citarEhSaida ?? false,
          }
        : undefined;
      return mapearResultado(
        await enviarTexto(numero, saida.texto, instancia, quoted),
      );
    }
    case "AUDIO": {
      if (!saida.midiaRef) return RECUSA_SEM_CONTEUDO;
      return mapearResultado(
        await enviarAudio(numero, saida.midiaRef, instancia, saida.atrasoMs),
      );
    }
    case "IMAGEM":
    case "VIDEO":
    case "DOCUMENTO": {
      if (!saida.midiaRef) return RECUSA_SEM_CONTEUDO;
      const mediatype =
        saida.tipo === "IMAGEM"
          ? "image"
          : saida.tipo === "VIDEO"
            ? "video"
            : "document";
      return mapearResultado(
        await enviarMidia(numero, saida.midiaRef, mediatype, instancia, {
          ...(saida.fileName ? { fileName: saida.fileName } : {}),
          ...(saida.texto ? { caption: saida.texto } : {}),
          ...(saida.mime ? { mimetype: saida.mime } : {}),
        }),
      );
    }
    case "CONTATO": {
      if (!saida.contato) return RECUSA_SEM_CONTEUDO;
      return mapearResultado(
        await enviarContato(numero, instancia, saida.contato),
      );
    }
  }
}

export const adapterEnvioEvolution: CanalAdapterEnvio = {
  provider: "EVOLUTION",
  capacidades: capacidadesEvolution,
  enviar,
};
