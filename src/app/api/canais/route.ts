// Status de configuracao dos canais de envio (WhatsApp/SMS/Email). Usado pelo
// compositor de campanha e pela area admin de Comunicacoes. As envs so sao
// reveladas ao ADMIN (os demais veem apenas configurado/nao configurado).
import { NextResponse } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { statusCanais } from "@/lib/providers";
import { lojaConfigurada } from "@/lib/integracaoLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const canais = statusCanais().map((c) => ({
    canal: c.canal,
    rotulo: c.rotulo,
    configurado: c.configurado,
    envs: admin ? c.envs : undefined,
  }));
  return NextResponse.json({
    canais,
    loja: { configurada: lojaConfigurada() },
  });
}
