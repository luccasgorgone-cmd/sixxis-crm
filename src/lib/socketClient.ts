"use client";

// Singleton do cliente Socket.io. Conecta na MESMA origem (sem URL) e e
// reaproveitado por toda a UI. So roda no browser.
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}
