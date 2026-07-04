// Upload para o Cloudflare R2 (S3-compativel) sem SDK: assinatura SigV4 feita a
// mao com node:crypto. Tudo guardado por env; sem credencial = no-op (a ingestao
// nunca quebra). Envs: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET, R2_PUBLIC_URL (base publica do bucket, ex.: https://midia.exemplo.com).
import crypto from "node:crypto";

export function r2Configurado(): boolean {
  return (
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET
  );
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Sobe um objeto e devolve a URL publica permanente, ou null em falha/no-op.
export async function enviarParaR2(
  chave: string,
  corpo: Buffer,
  contentType: string,
): Promise<string | null> {
  if (!r2Configurado()) return null;
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKey = process.env.R2_ACCESS_KEY_ID!;
  const secret = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET!;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const method = "PUT";

  // Mantemos chaves com caracteres seguros (a-z0-9/._-), entao encodeURI basta.
  const canonicalUri = `/${bucket}/${encodeURI(chave)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(corpo);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const resp = await fetch(`https://${host}${canonicalUri}`, {
      method,
      headers: {
        Host: host,
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: authorization,
      },
      body: new Uint8Array(corpo),
    });
    if (!resp.ok) {
      console.warn(`[r2] upload falhou (${resp.status}) para ${chave}`);
      return null;
    }
    const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
    return base ? `${base}/${chave}` : null;
  } catch (erro) {
    console.warn(
      `[r2] erro no upload de ${chave}: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return null;
  }
}

// Sobe ao R2 com RETRY (backoff curto). Aumenta a chance de a midia ficar com a
// URL permanente do R2 (renderavel e sem o problema de payload do base64) —
// essencial para audios longos e arquivos maiores. Fatia 2.85.
export async function enviarParaR2ComRetry(
  chave: string,
  corpo: Buffer,
  contentType: string,
  tentativas = 3,
): Promise<string | null> {
  for (let i = 0; i < tentativas; i++) {
    const url = await enviarParaR2(chave, corpo, contentType);
    if (url) return url;
    if (i < tentativas - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return null;
}

// Extensao a partir do mimetype (fallback bin).
export function extensaoDoMime(mime: string | null | undefined): string {
  if (!mime) return "bin";
  const m = mime.split(";")[0].trim().toLowerCase();
  const mapa: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
  };
  return mapa[m] ?? (m.includes("/") ? m.split("/")[1].slice(0, 5) : "bin");
}
