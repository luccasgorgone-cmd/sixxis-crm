"use client";

// F7-Calling — servico de chamada no cliente (hook React).
//
// Encapsula o ciclo de vida do WebRTC no browser: captura de midia
// (getUserMedia), RTCPeerConnection, troca de SDP/ICE via Socket.io e o estado
// da chamada para a UI. O motor e provider-agnostico:
//   - caminho INTERNO (agente<->agente): usa o relay de sinalizacao do servidor
//     (src/lib/sinalizacaoChamada.ts), ja funcional.
//   - caminho CLIENTE (WhatsApp oficial): fica atras da flag CHAMADAS_ATIVAS ate
//     o numero migrar pra Cloud API; a discagem real sera plugada por um bridge
//     de provedor numa fase seguinte, reaproveitando este mesmo motor.
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socketClient";
import {
  EVT,
  CHAMADAS_ATIVAS,
  servidoresIce,
  type TipoChamada,
  type EstadoChamada,
  type AlvoChamada,
  type SinalOferta,
  type SinalResposta,
  type SinalIce,
  type SinalEncerrar,
} from "./tipos";

export interface ChamadaAtual {
  id: string;
  tipo: TipoChamada;
  alvo: AlvoChamada;
  entrada: boolean; // true = recebida; false = originada por nos
}

export interface UsoChamada {
  estado: EstadoChamada;
  chamada: ChamadaAtual | null;
  streamLocal: MediaStream | null;
  streamRemoto: MediaStream | null;
  mudo: boolean;
  disponivelParaCliente: boolean; // reflete CHAMADAS_ATIVAS
  iniciarParaCliente: (alvo: AlvoChamada, tipo: TipoChamada) => void;
  aceitar: () => Promise<void>;
  recusar: () => void;
  encerrar: () => void;
  alternarMudo: () => void;
}

function novoId(): string {
  return `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useChamada(agenteId: string): UsoChamada {
  const [estado, setEstado] = useState<EstadoChamada>("ocioso");
  const [chamada, setChamada] = useState<ChamadaAtual | null>(null);
  const [streamLocal, setStreamLocal] = useState<MediaStream | null>(null);
  const [streamRemoto, setStreamRemoto] = useState<MediaStream | null>(null);
  const [mudo, setMudo] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const paraRef = useRef<string | null>(null); // agente destino (caminho interno)
  const ofertaPendenteRef = useRef<SinalOferta | null>(null);

  // Identifica este socket como o agente atual (entra na sala agente:<id>) para
  // receber chamadas direcionadas. Aditivo — nao interfere no realtime existente.
  useEffect(() => {
    if (!agenteId) return;
    const socket = getSocket();
    const identificar = () => socket.emit(EVT.identificar, { agenteId });
    identificar();
    socket.on("connect", identificar);
    return () => {
      socket.off("connect", identificar);
    };
  }, [agenteId]);

  const limpar = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    ofertaPendenteRef.current = null;
    paraRef.current = null;
    setStreamLocal(null);
    setStreamRemoto(null);
    setMudo(false);
  }, []);

  const criarPc = useCallback(
    (chamadaId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: servidoresIce() });
      pc.onicecandidate = (ev) => {
        const para = paraRef.current;
        if (ev.candidate && para) {
          getSocket().emit(EVT.ice, {
            chamadaId,
            paraAgenteId: para,
            candidato: ev.candidate.toJSON(),
          } satisfies SinalIce);
        }
      };
      pc.ontrack = (ev) => {
        setStreamRemoto(ev.streams[0] ?? null);
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") setEstado("em_chamada");
        else if (s === "failed") setEstado("erro");
        else if (s === "disconnected" || s === "closed") setEstado("encerrada");
      };
      pcRef.current = pc;
      return pc;
    },
    [],
  );

  const capturarMidia = useCallback(
    async (tipo: TipoChamada): Promise<MediaStream> => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: tipo === "video",
      });
      localRef.current = stream;
      setStreamLocal(stream);
      return stream;
    },
    [],
  );

  // --- Saida para o CLIENTE (WhatsApp) ---
  const iniciarParaCliente = useCallback(
    (alvo: AlvoChamada, tipo: TipoChamada) => {
      setChamada({ id: novoId(), tipo, alvo, entrada: false });
      if (!CHAMADAS_ATIVAS) {
        // Gate: a discagem real depende da migracao pro WhatsApp oficial.
        setEstado("erro");
        return;
      }
      // Fase de provedor: o bridge do WhatsApp oficial ainda nao esta plugado.
      // Mantido explicito para nao dar falsa sensacao de chamada em andamento.
      setEstado("erro");
    },
    [],
  );

  // --- Entrada (caminho interno agente<->agente via relay) ---
  const aceitar = useCallback(async () => {
    const oferta = ofertaPendenteRef.current;
    if (!oferta) return;
    setEstado("conectando");
    paraRef.current = oferta.deAgenteId;
    try {
      const pc = criarPc(oferta.chamadaId);
      const local = await capturarMidia(oferta.tipo);
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      await pc.setRemoteDescription({ type: "offer", sdp: oferta.sdp });
      const resposta = await pc.createAnswer();
      await pc.setLocalDescription(resposta);
      getSocket().emit(EVT.resposta, {
        chamadaId: oferta.chamadaId,
        paraAgenteId: oferta.deAgenteId,
        sdp: resposta.sdp ?? "",
      } satisfies SinalResposta);
    } catch {
      setEstado("erro");
    }
  }, [criarPc, capturarMidia]);

  const recusar = useCallback(() => {
    const oferta = ofertaPendenteRef.current;
    if (oferta) {
      getSocket().emit(EVT.recusar, {
        chamadaId: oferta.chamadaId,
        paraAgenteId: oferta.deAgenteId,
      } satisfies SinalEncerrar);
    }
    limpar();
    setEstado("recusada");
    setChamada(null);
  }, [limpar]);

  const encerrar = useCallback(() => {
    const para = paraRef.current;
    if (para && chamada) {
      getSocket().emit(EVT.encerrar, {
        chamadaId: chamada.id,
        paraAgenteId: para,
      } satisfies SinalEncerrar);
    }
    limpar();
    setEstado("encerrada");
    setChamada(null);
  }, [limpar, chamada]);

  const alternarMudo = useCallback(() => {
    const local = localRef.current;
    if (!local) return;
    const novo = !mudo;
    local.getAudioTracks().forEach((t) => (t.enabled = !novo));
    setMudo(novo);
  }, [mudo]);

  // Escuta os sinais de entrada (relay). Aditivo aos listeners existentes.
  useEffect(() => {
    const socket = getSocket();

    const onOferta = (p: SinalOferta) => {
      // Ja em chamada: ignora (ocupado). Uma versao futura pode sinalizar busy.
      if (pcRef.current) return;
      ofertaPendenteRef.current = p;
      setChamada({
        id: p.chamadaId,
        tipo: p.tipo,
        alvo: { conversaId: p.conversaId, nome: p.deNome, telefone: "" },
        entrada: true,
      });
      setEstado("recebendo");
    };

    const onResposta = async (p: SinalResposta) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: p.sdp });
      } catch {
        setEstado("erro");
      }
    };

    const onIce = async (p: SinalIce) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.addIceCandidate(p.candidato);
      } catch {
        // candidato invalido/tardio: ignora sem derrubar a chamada.
      }
    };

    const onEncerrar = () => {
      limpar();
      setEstado("encerrada");
      setChamada(null);
    };

    socket.on(EVT.oferta, onOferta);
    socket.on(EVT.resposta, onResposta);
    socket.on(EVT.ice, onIce);
    socket.on(EVT.recusar, onEncerrar);
    socket.on(EVT.encerrar, onEncerrar);
    return () => {
      socket.off(EVT.oferta, onOferta);
      socket.off(EVT.resposta, onResposta);
      socket.off(EVT.ice, onIce);
      socket.off(EVT.recusar, onEncerrar);
      socket.off(EVT.encerrar, onEncerrar);
    };
  }, [limpar]);

  return {
    estado,
    chamada,
    streamLocal,
    streamRemoto,
    mudo,
    disponivelParaCliente: CHAMADAS_ATIVAS,
    iniciarParaCliente,
    aceitar,
    recusar,
    encerrar,
    alternarMudo,
  };
}
