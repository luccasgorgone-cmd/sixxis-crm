"use client";

// Coluna central: cabecalho do contato, mensagens (bolhas) e o compositor.
import { useEffect, useRef } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Mic,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Bot,
  User as UserIcon,
} from "lucide-react";
import type { ConversaItem, MensagemItem } from "./tipos";
import { Compositor } from "./Compositor";
import {
  horaCurta,
  rotuloDia,
  chaveDia,
  iniciais,
  formatarTelefone,
} from "@/lib/format";

export function Thread({
  conversa,
  mensagens,
  carregando,
  onEnviada,
}: {
  conversa: ConversaItem;
  mensagens: MensagemItem[];
  carregando: boolean;
  onEnviada: (msg: MensagemItem) => void;
}) {
  const fimRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para o fim quando chegam/abrem mensagens.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, carregando]);

  const nome = conversa.leadNome?.trim() || conversa.leadTelefone;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-fundo">
      {/* Cabecalho */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-medio/10 text-sm font-semibold text-medio">
          {iniciais(conversa.leadNome, conversa.leadTelefone)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-escuro">{nome}</p>
          <p className="truncate text-xs text-medio/60">
            {formatarTelefone(conversa.leadTelefone)}
            {conversa.instanciaNome ? ` · ${conversa.instanciaNome}` : ""}
          </p>
        </div>
        {conversa.finalidade && (
          <span
            className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${
              conversa.finalidade === "POS_VENDA"
                ? "bg-purple-100 text-purple-700"
                : "bg-tiffany/10 text-tiffany"
            }`}
          >
            {conversa.finalidade === "POS_VENDA" ? "Pos-venda" : "Venda"}
          </span>
        )}
        <span
          className={`${conversa.finalidade ? "" : "ml-auto "}flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            conversa.atendidoPor === "IA"
              ? "bg-tiffany/10 text-tiffany"
              : "bg-medio/10 text-medio"
          }`}
        >
          {conversa.atendidoPor === "IA" ? (
            <Bot className="h-3.5 w-3.5" />
          ) : (
            <UserIcon className="h-3.5 w-3.5" />
          )}
          {conversa.atendidoPor === "IA" ? "IA" : "Humano"}
        </span>
      </header>

      {/* Mensagens */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {carregando ? (
          <SkeletonThread />
        ) : mensagens.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-medio/50">
              Nenhuma mensagem ainda. Comece a conversa.
            </p>
          </div>
        ) : (
          <ListaMensagens mensagens={mensagens} />
        )}
        <div ref={fimRef} />
      </div>

      <Compositor conversaId={conversa.id} onEnviada={onEnviada} />
    </div>
  );
}

function ListaMensagens({ mensagens }: { mensagens: MensagemItem[] }) {
  const blocos: { dia: string; itens: MensagemItem[] }[] = [];
  let chaveAtual = "";
  for (const m of mensagens) {
    const k = chaveDia(m.hora);
    if (k !== chaveAtual) {
      chaveAtual = k;
      blocos.push({ dia: rotuloDia(m.hora), itens: [m] });
    } else {
      blocos[blocos.length - 1].itens.push(m);
    }
  }

  return (
    <div className="space-y-4">
      {blocos.map((bloco, i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-center">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-medio/60 shadow-sm">
              {bloco.dia}
            </span>
          </div>
          {bloco.itens.map((m) => (
            <Bolha key={m.id} mensagem={m} />
          ))}
        </div>
      ))}
    </div>
  );
}

const ICONE_MIDIA: Record<string, typeof Mic> = {
  AUDIO: Mic,
  IMAGEM: ImageIcon,
  VIDEO: VideoIcon,
  DOCUMENTO: FileText,
};
const ROTULO_MIDIA: Record<string, string> = {
  AUDIO: "Mensagem de audio",
  IMAGEM: "Imagem",
  VIDEO: "Video",
  DOCUMENTO: "Documento",
  OUTRO: "Mensagem",
};

function Bolha({ mensagem }: { mensagem: MensagemItem }) {
  const ehOut = mensagem.direcao === "OUT";
  const temTexto = Boolean(mensagem.conteudo && mensagem.conteudo.trim());
  const ehMidia = mensagem.tipo !== "TEXTO" && !temTexto;
  const IconeMidia = ICONE_MIDIA[mensagem.tipo];

  return (
    <div className={`flex ${ehOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm ${
          ehOut
            ? "rounded-br-sm bg-tiffany text-white"
            : "rounded-bl-sm bg-white text-escuro"
        }`}
      >
        {ehMidia ? (
          <span
            className={`flex items-center gap-2 italic ${
              ehOut ? "text-white/90" : "text-medio/70"
            }`}
          >
            {IconeMidia && <IconeMidia className="h-4 w-4" />}
            {ROTULO_MIDIA[mensagem.tipo] ?? "Mensagem"}
          </span>
        ) : (
          <span className="whitespace-pre-wrap break-words">
            {mensagem.conteudo}
          </span>
        )}

        <span
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            ehOut ? "text-white/70" : "text-medio/50"
          }`}
        >
          {horaCurta(mensagem.hora)}
          {ehOut && <StatusEnvio status={mensagem.statusEnvio} />}
        </span>
      </div>
    </div>
  );
}

function StatusEnvio({ status }: { status: MensagemItem["statusEnvio"] }) {
  switch (status) {
    case "ENVIANDO":
      return <Clock className="h-3 w-3" />;
    case "ENVIADA":
      return <Check className="h-3 w-3" />;
    case "ENTREGUE":
      return <CheckCheck className="h-3 w-3" />;
    case "ERRO":
      return <AlertCircle className="h-3 w-3 text-red-200" />;
    default:
      return null;
  }
}

function SkeletonThread() {
  const larguras = ["w-40", "w-56", "w-32", "w-48", "w-44"];
  return (
    <div className="space-y-3">
      {larguras.map((w, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
        >
          <div className={`skeleton h-10 ${w} rounded-xl`} />
        </div>
      ))}
    </div>
  );
}
