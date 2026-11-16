// Autenticacao do handshake do Socket.io.
//
// O Socket.io roda no MESMO servidor HTTP do Next (server.ts), mas FORA do
// middleware do Next: o caminho /socket.io/ nunca passa pelo src/middleware.ts.
// Sem esta checagem, qualquer cliente anonimo conseguia conectar e receber os
// broadcasts globais (mensagem:nova etc.). Aqui exigimos a MESMA sessao do
// painel (cookie JWT do NextAuth, enviado automaticamente pelo browser na
// conexao same-origin) e reconferimos `ativo` no banco, como o obterAgente().
//
// Modulo sem import de Prisma: a verificacao de `ativo` e injetada (server.ts
// passa a consulta real; o contrato C18 passa um stub), para o teste rodar sem
// banco.
import { getToken, type JWT } from "next-auth/jwt";
import type { Server, Socket } from "socket.io";

export type AgenteSocket = { id: string; papel: string };

export type VerificarAtivo = (agenteId: string) => Promise<boolean>;

export type OpcoesAuthSocket = {
  secret: string | undefined;
  verificarAtivo: VerificarAtivo;
  // Modo sandbox LOCAL (SANDBOX_ONLY=1): mesmo comportamento do middleware do
  // Next — libera sem login. Em producao essa env nunca existe.
  sandbox?: boolean;
};

// Decodifica a sessao a partir do header Cookie do handshake. Tenta o cookie
// seguro (__Secure-authjs.session-token, usado em HTTPS/producao) e o comum
// (authjs.session-token, usado em http local). O decode valida a assinatura/
// criptografia com o segredo e a expiracao do JWT.
export async function agenteDoCookie(
  cookieHeader: string | undefined,
  opcoes: Pick<OpcoesAuthSocket, "secret" | "verificarAtivo">,
): Promise<AgenteSocket | null> {
  if (!opcoes.secret || !cookieHeader) return null;
  for (const secureCookie of [true, false]) {
    let token: JWT | null = null;
    try {
      token = await getToken({
        req: { headers: { cookie: cookieHeader } },
        secret: opcoes.secret,
        secureCookie,
        // Silencia o logger do auth (cookie invalido/expirado nao e erro do servidor).
        logger: { error: () => undefined, warn: () => undefined, debug: () => undefined },
      });
    } catch {
      token = null;
    }
    const id = typeof token?.id === "string" ? token.id : "";
    if (!id) continue;
    const ativo = await opcoes.verificarAtivo(id).catch(() => false);
    if (!ativo) return null;
    return { id, papel: String(token?.papel ?? "") };
  }
  return null;
}

// Registra o middleware de handshake: sem sessao valida -> conexao recusada
// (o cliente recebe connect_error "nao autenticado"). Com sessao, o agente fica
// em socket.data.agente para os handlers (ex.: sinalizacao de chamada).
export function exigirSessaoNoSocket(io: Server, opcoes: OpcoesAuthSocket): void {
  io.use((socket: Socket, next: (err?: Error) => void) => {
    if (opcoes.sandbox) {
      next();
      return;
    }
    const cookie = socket.handshake.headers.cookie;
    agenteDoCookie(typeof cookie === "string" ? cookie : undefined, opcoes)
      .then((agente) => {
        if (!agente) {
          next(new Error("nao autenticado"));
          return;
        }
        socket.data.agente = agente;
        next();
      })
      .catch(() => next(new Error("nao autenticado")));
  });
}

// Agente autenticado do socket (definido pelo exigirSessaoNoSocket).
export function agenteDoSocket(socket: Socket): AgenteSocket | null {
  const a = socket.data?.agente as AgenteSocket | undefined;
  return a && typeof a.id === "string" && a.id ? a : null;
}
