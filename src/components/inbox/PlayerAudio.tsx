"use client";

// Player de audio customizado (Fatia V): play/pause, barra de progresso, tempo
// decorrido e um botao de VELOCIDADE que cicla 1x -> 1.5x -> 2x -> 1x (estilo
// WhatsApp). Usa <audio> por baixo, sem libs novas, com UI propria. Substitui o
// <audio controls> nativo da Thread (que nao tem controle de velocidade).
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

// Velocidade preferida, guardada em MEMORIA pela sessao (sem localStorage —
// proibido). Cada player novo nasce nessa velocidade; ao ciclar, atualiza para
// os proximos audios. Players ja montados nao mudam retroativamente (como no
// WhatsApp, a escolha vale do proximo audio em diante).
let velocidadePreferida = 1;
const VELOCIDADES = [1, 1.5, 2] as const;

function mmss(seg: number): string {
  if (!isFinite(seg) || seg < 0) return "0:00";
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerAudio({
  mediaUrl,
  ehOut,
}: {
  mediaUrl: string;
  ehOut: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState(velocidadePreferida);
  const [erro, setErro] = useState(false);

  // Reaplica a velocidade sempre que muda (o playbackRate reseta ao trocar src).
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = velocidade;
  }, [velocidade, mediaUrl]);

  function alternarPlay() {
    const el = audioRef.current;
    if (!el || erro) return;
    if (tocando) {
      el.pause();
    } else {
      el.playbackRate = velocidade;
      void el.play().catch(() => setErro(true));
    }
  }

  function ciclarVelocidade() {
    const i = VELOCIDADES.indexOf(velocidade as (typeof VELOCIDADES)[number]);
    const prox = VELOCIDADES[(i + 1) % VELOCIDADES.length];
    setVelocidade(prox);
    velocidadePreferida = prox;
    const el = audioRef.current;
    if (el) el.playbackRate = prox;
  }

  function buscar(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !isFinite(duracao) || duracao <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = frac * duracao;
    setAtual(el.currentTime);
  }

  const temDuracao = isFinite(duracao) && duracao > 0;
  const fracao = temDuracao ? Math.min(1, atual / duracao) : 0;

  // Cores adaptadas a bolha: OUT (verde/tiffany, texto claro) x IN (clara).
  const corControle = ehOut ? "text-white" : "text-tiffany";
  const corTexto = ehOut ? "text-white/80" : "text-medio/70";
  const trilha = ehOut ? "bg-white/25" : "bg-black/10";
  const preenchida = ehOut ? "bg-white" : "bg-tiffany";
  const chip = ehOut
    ? "bg-white/20 text-white hover:bg-white/30"
    : "bg-tiffany/10 text-tiffany hover:bg-tiffany/20";

  return (
    <div className="flex w-56 max-w-full items-center gap-2">
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuracao(isFinite(d) ? d : 0);
          e.currentTarget.playbackRate = velocidade;
        }}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setAtual(0);
        }}
        onError={() => setErro(true)}
      />
      <button
        onClick={alternarPlay}
        disabled={erro}
        aria-label={tocando ? "Pausar" : "Tocar"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${corControle} disabled:opacity-50`}
      >
        {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          onClick={buscar}
          className={`h-1.5 w-full ${temDuracao ? "cursor-pointer" : ""} overflow-hidden rounded-full ${trilha}`}
        >
          <div
            className={`h-full rounded-full ${preenchida}`}
            style={{ width: `${fracao * 100}%` }}
          />
        </div>
        <div
          className={`mt-1 flex items-center justify-between text-[10px] ${corTexto}`}
        >
          <span>{erro ? "Erro ao carregar" : mmss(atual)}</span>
          {!erro && temDuracao && <span>{mmss(duracao)}</span>}
        </div>
      </div>
      <button
        onClick={ciclarVelocidade}
        aria-label="Velocidade de reproducao"
        title="Velocidade de reproducao"
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${chip}`}
      >
        {velocidade}x
      </button>
    </div>
  );
}
