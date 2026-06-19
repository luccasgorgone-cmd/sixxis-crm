// Helpers de autorizacao por papel, usados pelas rotas de API de negocio.
import { auth } from "@/auth";
import { Papel } from "@/generated/prisma/enums";

export type SessaoAgente = {
  id: string;
  papel: Papel;
  nome: string | null;
};

// Retorna o agente da sessao ou null (deslogado).
export async function obterAgente(): Promise<SessaoAgente | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    papel: session.user.papel,
    nome: session.user.name ?? null,
  };
}

export function ehAdmin(papel: Papel): boolean {
  return papel === Papel.ADMIN;
}

// VENDEDOR/POS_VENDA so podem agir sobre negocios proprios.
export function podeAcessarNegocio(
  agente: SessaoAgente,
  negocioAgenteId: string | null,
): boolean {
  if (ehAdmin(agente.papel)) return true;
  return negocioAgenteId === agente.id;
}
