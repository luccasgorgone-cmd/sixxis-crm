// Contrato dourado C18 — o Socket.io exige a sessao do painel no handshake.
//   npx tsx scripts/contratos/c18-socket-auth.ts
//
// O /socket.io/ roda fora do middleware do Next. Este contrato sobe um servidor
// Socket.io LOCAL (porta efemera em 127.0.0.1, sem banco: `ativo` e um stub) com
// a MESMA ligacao do server.ts (exigirSessaoNoSocket + sinalizacao de chamada) e
// prova que:
//  - cliente SEM cookie de sessao e recusado e NAO recebe broadcast;
//  - cookie forjado/assinado com outro segredo e recusado;
//  - agente desativado (ativo=false) e recusado;
//  - sessao valida conecta e recebe o broadcast normalmente;
//  - "identificar" como OUTRO agente nao coloca o socket na sala desse agente.
import assert from "node:assert";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { encode } from "next-auth/jwt";
import { exigirSessaoNoSocket } from "../../src/lib/socketAuth";
import { registrarSinalizacaoChamada } from "../../src/lib/sinalizacaoChamada";
import { EVT, salaAgente } from "../../src/lib/chamada/tipos";

const SEGREDO = "segredo-de-teste-c18-nao-e-producao-0123456789";
const COOKIE = "authjs.session-token";
const ATIVOS = new Set(["agente-a", "agente-b"]);

let ok = 0;
let falhou = 0;
async function caso(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhou++;
    console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function cookieDe(id: string, segredo = SEGREDO): Promise<string> {
  const jwt = await encode({
    token: { id, papel: "VENDEDOR", sub: id },
    secret: segredo,
    salt: COOKIE,
  });
  return `${COOKIE}=${jwt}`;
}

type Resultado = { conectou: boolean; erro?: string; socket?: ClientSocket };

function conectar(url: string, cookie?: string): Promise<Resultado> {
  return new Promise((resolve) => {
    const s = ioClient(url, {
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
      extraHeaders: cookie ? { cookie } : {},
    });
    const t = setTimeout(() => {
      s.close();
      resolve({ conectou: false, erro: "timeout" });
    }, 3000);
    s.on("connect", () => {
      clearTimeout(t);
      resolve({ conectou: true, socket: s });
    });
    s.on("connect_error", (e) => {
      clearTimeout(t);
      s.close();
      resolve({ conectou: false, erro: e.message });
    });
  });
}

function recebe(s: ClientSocket, evento: string, ms = 500): Promise<unknown | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    s.once(evento, (p: unknown) => {
      clearTimeout(t);
      resolve(p);
    });
  });
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const http = createServer();
  const io = new Server(http);
  exigirSessaoNoSocket(io, {
    secret: SEGREDO,
    verificarAtivo: async (id) => ATIVOS.has(id),
  });
  registrarSinalizacaoChamada(io);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  await caso("sem cookie -> conexao recusada", async () => {
    const r = await conectar(url);
    assert.equal(r.conectou, false);
    assert.equal(r.erro, "nao autenticado");
  });

  await caso("cookie lixo -> recusada", async () => {
    const r = await conectar(url, `${COOKIE}=abc.def.ghi`);
    assert.equal(r.conectou, false);
  });

  await caso("JWT assinado com OUTRO segredo -> recusada", async () => {
    const r = await conectar(url, await cookieDe("agente-a", "outro-segredo-qualquer-0123456789abcdef"));
    assert.equal(r.conectou, false);
  });

  await caso("agente desativado (ativo=false) -> recusada", async () => {
    const r = await conectar(url, await cookieDe("agente-inativo"));
    assert.equal(r.conectou, false);
  });

  await caso("sessao valida -> conecta e recebe broadcast", async () => {
    const r = await conectar(url, await cookieDe("agente-a"));
    assert.equal(r.conectou, true, r.erro);
    const p = recebe(r.socket!, "mensagem:nova");
    io.emit("mensagem:nova", { conversaId: "c1" });
    assert.deepEqual(await p, { conversaId: "c1" });
    r.socket!.close();
  });

  await caso("identificar como OUTRO agente nao entra na sala dele", async () => {
    const r = await conectar(url, await cookieDe("agente-a"));
    assert.equal(r.conectou, true, r.erro);
    r.socket!.emit(EVT.identificar, { agenteId: "agente-b" });
    await espera(150);
    const outro = recebe(r.socket!, EVT.oferta);
    io.to(salaAgente("agente-b")).emit(EVT.oferta, { chamadaId: "x" });
    assert.equal(await outro, null, "recebeu oferta destinada a outro agente");
    const proprio = recebe(r.socket!, EVT.oferta);
    io.to(salaAgente("agente-a")).emit(EVT.oferta, { chamadaId: "y" });
    assert.deepEqual(await proprio, { chamadaId: "y" });
    r.socket!.close();
  });

  io.close();
  http.close();

  console.log(`\nC18 socket-auth: ${ok} ok, ${falhou} falha(s)`);
  if (falhou > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
