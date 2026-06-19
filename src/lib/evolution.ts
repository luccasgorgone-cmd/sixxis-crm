// Cliente minimo da Evolution API para ENVIO de texto (outbound).
// Nenhuma conexao no topo do modulo; tudo lido de env em runtime.
type ResultadoEnvio = {
  ok: boolean;
  externalId?: string;
  status?: number;
  raw: unknown;
};

// Envia uma mensagem de texto para um numero (apenas digitos, com DDI).
// Endpoint: POST {BASE}/message/sendText/{INSTANCE}  header apikey.
export async function enviarTexto(
  numero: string,
  texto: string,
): Promise<ResultadoEnvio> {
  const base = process.env.EVOLUTION_BASE_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apikey = process.env.EVOLUTION_API_KEY;

  if (!base || !instance || !apikey) {
    return { ok: false, raw: { erro: "config Evolution ausente" } };
  }

  const url = `${base.replace(/\/$/, "")}/message/sendText/${instance}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
      },
      body: JSON.stringify({ number: numero, text: texto }),
    });

    const raw: unknown = await resp.json().catch(() => null);

    if (!resp.ok) {
      return { ok: false, status: resp.status, raw };
    }

    // A Evolution retorna o id da mensagem em key.id quando aceita.
    const externalId =
      typeof raw === "object" && raw !== null
        ? (raw as { key?: { id?: string } }).key?.id
        : undefined;

    return { ok: true, externalId, raw };
  } catch (erro) {
    return {
      ok: false,
      raw: { erro: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}
