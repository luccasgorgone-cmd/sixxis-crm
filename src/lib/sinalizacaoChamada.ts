// F7-Calling — relay de sinalizacao de chamada no servidor.
//
// ADITIVO: registra handlers em io.on("connection") SEM tocar nos emits globais
// existentes (mensagem:nova, conversa:atualizada, etc.). A conexao ja chega
// autenticada pelo handshake (src/lib/socketAuth.ts, registrado no server.ts):
// o socket so entra na sala do PROPRIO agente da sessao (agente:<id>) — o
// agenteId enviado pelo cliente e ignorado quando ha sessao, para ninguem
// "se identificar" como outro agente e receber as chamadas dele.
import type { Server, Socket } from "socket.io";
import { agenteDoSocket } from "./socketAuth";
import {
  EVT,
  salaAgente,
  type SinalOferta,
  type SinalResposta,
  type SinalIce,
  type SinalEncerrar,
} from "./chamada/tipos";

export function registrarSinalizacaoChamada(io: Server): void {
  io.on("connection", (socket: Socket) => {
    // O cliente se identifica apos conectar; entra na sala do proprio agente.
    socket.on(EVT.identificar, (p: { agenteId?: string }) => {
      // Com sessao (producao): SEMPRE o agente autenticado. Sem sessao so existe
      // no modo sandbox local (SANDBOX_ONLY=1), onde vale o id informado.
      const daSessao = agenteDoSocket(socket);
      const id = daSessao ? daSessao.id : p?.agenteId?.trim();
      if (!id) return;
      void socket.join(salaAgente(id));
    });

    // Oferta de chamada (saida) -> entrega ao agente destino (interno) na sala
    // dele. Para chamada a provedor externo (WhatsApp) nao ha paraAgenteId; esse
    // caminho sera tratado pelo bridge do provedor numa fase seguinte.
    socket.on(EVT.oferta, (p: SinalOferta) => {
      if (!p?.paraAgenteId) return;
      io.to(salaAgente(p.paraAgenteId)).emit(EVT.oferta, p);
    });

    socket.on(EVT.resposta, (p: SinalResposta) => {
      if (!p?.paraAgenteId) return;
      io.to(salaAgente(p.paraAgenteId)).emit(EVT.resposta, p);
    });

    socket.on(EVT.ice, (p: SinalIce) => {
      if (!p?.paraAgenteId) return;
      io.to(salaAgente(p.paraAgenteId)).emit(EVT.ice, p);
    });

    socket.on(EVT.recusar, (p: SinalEncerrar) => {
      if (!p?.paraAgenteId) return;
      io.to(salaAgente(p.paraAgenteId)).emit(EVT.recusar, p);
    });

    socket.on(EVT.encerrar, (p: SinalEncerrar) => {
      if (!p?.paraAgenteId) return;
      io.to(salaAgente(p.paraAgenteId)).emit(EVT.encerrar, p);
    });
  });
}
