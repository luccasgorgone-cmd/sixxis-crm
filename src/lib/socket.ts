// Guarda a instancia do Socket.io num modulo para que o worker (e futuras
// partes do sistema) possam emitir eventos em tempo real sem precisar
// receber a instancia por parametro em toda a cadeia de chamadas.
import type { Server } from "socket.io";

let io: Server | null = null;

export function setIO(instancia: Server): void {
  io = instancia;
}

export function getIO(): Server | null {
  return io;
}
