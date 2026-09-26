// F7-Calling — relay de sinalizacao de chamada no servidor.
//
// ADITIVO: registra handlers em io.on("connection") SEM tocar nos emits globais
// existentes (mensagem:nova, conversa:atualizada, etc.). Nenhuma conexao e
// rejeitada — a identificacao do agente e opcional e so serve para criar salas
// por agente (agente:<id>), permitindo entregar a chamada ao browser certo em
// vez do broadcast global. Isto e o piso do F7.0; a auth estrita do handshake
// (rejeitar conexao sem sessao) fica para um passo seguinte, com cuidado de
// contrato para nao derrubar os clientes ja conectados.
import type { Server, Socket } from "socket.io";
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
      const id = p?.agenteId?.trim();
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
