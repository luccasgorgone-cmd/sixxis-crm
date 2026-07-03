// Admin: lista (GET) e cria (POST) figurinhas predefinidas. POST recebe a imagem
// em multipart/form-data (campo "arquivo") + "nome"; sobe ao R2 e persiste.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { enviarParaR2, extensaoDoMime, r2Configurado } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const figurinhas = await prisma.figurinhaSixxis.findMany({
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    select: { id: true, nome: true, url: true, ativo: true, ordem: true },
  });
  return NextResponse.json({ figurinhas });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!r2Configurado()) {
    return NextResponse.json(
      { erro: "armazenamento (R2) nao configurado" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const arquivo = form.get("arquivo");
  const nome = String(form.get("nome") ?? "").trim() || "Figurinha";
  if (!(arquivo instanceof Blob) || arquivo.size === 0) {
    return NextResponse.json({ erro: "arquivo obrigatorio" }, { status: 400 });
  }
  if (!(arquivo.type || "").startsWith("image/")) {
    return NextResponse.json({ erro: "envie uma imagem" }, { status: 415 });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const mime = arquivo.type || "image/webp";
  const ext = extensaoDoMime(mime);
  const chave = `figurinhas/${randomUUID()}.${ext}`;
  const url = await enviarParaR2(chave, buffer, mime);
  if (!url) {
    return NextResponse.json({ erro: "falha ao subir a imagem" }, { status: 502 });
  }

  const ultima = await prisma.figurinhaSixxis.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const figurinha = await prisma.figurinhaSixxis.create({
    data: { nome, url, ordem: (ultima?.ordem ?? 0) + 1 },
    select: { id: true, nome: true, url: true, ativo: true, ordem: true },
  });
  return NextResponse.json({ figurinha });
}
