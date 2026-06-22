// Providers de envio multicanal com degradacao graciosa (igual loja offline):
// sem credencial -> canal "nao configurado" e o envio marca FALHA. Tudo lido de
// env em runtime; nada conecta no topo do modulo.
//
// WhatsApp: Evolution (ja existente) — o envio em si fica no worker, que conhece
//   a instancia; aqui so reportamos o status de configuracao.
// SMS:   Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).
// Email: Resend (RESEND_API_KEY, RESEND_FROM).
import { CanalEnvio } from "@/generated/prisma/enums";

export type ResultadoCanal = { ok: boolean; erro?: string };

export type StatusCanal = {
  canal: CanalEnvio;
  rotulo: string;
  configurado: boolean;
  envs: string[]; // envs necessarias (para o admin setar)
};

function temEnvs(...nomes: string[]): boolean {
  return nomes.every((n) => !!process.env[n]);
}

export function whatsappConfigurado(): boolean {
  return temEnvs("EVOLUTION_BASE_URL", "EVOLUTION_API_KEY");
}
export function smsConfigurado(): boolean {
  return temEnvs("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM");
}
export function emailConfigurado(): boolean {
  return temEnvs("RESEND_API_KEY", "RESEND_FROM");
}

export function canalConfigurado(canal: CanalEnvio): boolean {
  if (canal === CanalEnvio.WHATSAPP) return whatsappConfigurado();
  if (canal === CanalEnvio.SMS) return smsConfigurado();
  return emailConfigurado();
}

// Status de todos os canais (para a area admin de Comunicacoes).
export function statusCanais(): StatusCanal[] {
  return [
    {
      canal: CanalEnvio.WHATSAPP,
      rotulo: "WhatsApp",
      configurado: whatsappConfigurado(),
      envs: ["EVOLUTION_BASE_URL", "EVOLUTION_API_KEY"],
    },
    {
      canal: CanalEnvio.SMS,
      rotulo: "SMS (Twilio)",
      configurado: smsConfigurado(),
      envs: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
    },
    {
      canal: CanalEnvio.EMAIL,
      rotulo: "Email (Resend)",
      configurado: emailConfigurado(),
      envs: ["RESEND_API_KEY", "RESEND_FROM"],
    },
  ];
}

// SMS via Twilio (REST, basic auth). Nunca lanca: retorna {ok,erro}.
export async function enviarSMS(
  numero: string,
  texto: string,
): Promise<ResultadoCanal> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { ok: false, erro: "canal nao configurado" };
  }
  try {
    const corpo = new URLSearchParams({ To: numero, From: from, Body: texto });
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: corpo.toString(),
      },
    );
    if (!resp.ok) {
      const d = (await resp.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, erro: d?.message ?? `erro ${resp.status}` };
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

// Email via Resend (REST). Nunca lanca: retorna {ok,erro}.
export async function enviarEmail(
  para: string,
  assunto: string,
  texto: string,
): Promise<ResultadoCanal> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    return { ok: false, erro: "canal nao configurado" };
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: para,
        subject: assunto || "Mensagem",
        text: texto,
      }),
    });
    if (!resp.ok) {
      const d = (await resp.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, erro: d?.message ?? `erro ${resp.status}` };
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
