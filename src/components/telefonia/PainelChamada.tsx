"use client";

// F7-Calling — overlay da chamada (voz/video): estados de toque, em-chamada e
// encerramento, com video local/remoto e controles (mudo/desligar/atender).
import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video as VideoIcon } from "lucide-react";
import type { UsoChamada } from "@/lib/chamada/servicoChamada";
import { AvatarCliente } from "@/components/AvatarCliente";

const ROTULO_ESTADO: Record<string, string> = {
  chamando: "Chamando...",
  recebendo: "Chamada recebida",
  conectando: "Conectando...",
  em_chamada: "Em chamada",
  encerrada: "Chamada encerrada",
  recusada: "Chamada recusada",
};

export function PainelChamada({
  uso,
  onFechar,
}: {
  uso: UsoChamada;
  onFechar: () => void;
}) {
  const {
    estado,
    chamada,
    streamLocal,
    streamRemoto,
    mudo,
    disponivelParaCliente,
  } = uso;
  const videoLocalRef = useRef<HTMLVideoElement>(null);
  const videoRemotoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoLocalRef.current && streamLocal) {
      videoLocalRef.current.srcObject = streamLocal;
    }
  }, [streamLocal]);

  useEffect(() => {
    if (videoRemotoRef.current && streamRemoto) {
      videoRemotoRef.current.srcObject = streamRemoto;
    }
  }, [streamRemoto]);

  if (!chamada) return null;

  const ehVideo = chamada.tipo === "video";
  // Gate: chamada de SAIDA para o cliente sem o WhatsApp oficial ligado.
  const bloqueadoPorMigracao =
    !chamada.entrada && !disponivelParaCliente && estado === "erro";

  return (
    <div className="fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="modal-in w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Cabecalho do card de chamada */}
        <div className="flex flex-col items-center gap-3 bg-fundo px-6 pt-8 pb-6">
          <AvatarCliente
            nome={chamada.alvo.nome}
            telefone={chamada.alvo.telefone}
            tamanho={72}
          />
          <div className="text-center">
            <p className="text-lg font-semibold text-escuro">
              {chamada.alvo.nome}
            </p>
            <p className="mt-0.5 flex items-center justify-center gap-1.5 text-sm text-medio/70">
              {ehVideo ? (
                <VideoIcon className="h-4 w-4" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              {bloqueadoPorMigracao
                ? ehVideo
                  ? "Vídeo chamada"
                  : "Ligação"
                : (ROTULO_ESTADO[estado] ?? "")}
            </p>
          </div>
        </div>

        {/* Corpo: mensagem de gate OU midia */}
        {bloqueadoPorMigracao ? (
          <div className="px-6 py-5">
            <p className="rounded-xl bg-tiffany/5 p-4 text-center text-sm text-medio/80">
              A ligação {ehVideo ? "por vídeo " : ""}pelo WhatsApp fica
              disponível assim que o número migrar para o{" "}
              <strong className="text-escuro">WhatsApp oficial</strong> (Cloud
              API). O botão e a tela de chamada já estão prontos — falta só o
              aceite dos Termos e a migração para acender a discagem real.
            </p>
          </div>
        ) : (
          ehVideo &&
          (estado === "em_chamada" || estado === "conectando") && (
            <div className="relative bg-black">
              <video
                ref={videoRemotoRef}
                autoPlay
                playsInline
                className="h-56 w-full bg-black object-cover"
              />
              <video
                ref={videoLocalRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-3 right-3 h-24 w-16 rounded-lg border border-white/20 object-cover"
              />
            </div>
          )
        )}

        {/* Controles */}
        <div className="flex items-center justify-center gap-4 px-6 py-6">
          {estado === "recebendo" && chamada.entrada ? (
            <>
              <button
                onClick={() => void uso.aceitar()}
                aria-label="Atender"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-sucesso text-white transition hover:brightness-95"
              >
                <Phone className="h-6 w-6" />
              </button>
              <button
                onClick={() => {
                  uso.recusar();
                  onFechar();
                }}
                aria-label="Recusar"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-erro text-white transition hover:brightness-95"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </>
          ) : estado === "em_chamada" || estado === "conectando" ? (
            <>
              <button
                onClick={uso.alternarMudo}
                aria-label={mudo ? "Ativar microfone" : "Silenciar microfone"}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                  mudo
                    ? "bg-medio/20 text-escuro"
                    : "bg-black/5 text-medio hover:bg-black/10"
                }`}
              >
                {mudo ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => {
                  uso.encerrar();
                  onFechar();
                }}
                aria-label="Desligar"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-erro text-white transition hover:brightness-95"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                uso.encerrar();
                onFechar();
              }}
              className="rounded-xl bg-black/5 px-5 py-2.5 text-sm font-semibold text-escuro transition hover:bg-black/10"
            >
              {bloqueadoPorMigracao ? "Entendi" : "Fechar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
