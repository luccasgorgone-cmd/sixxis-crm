"use client";

// Seletor de emojis do compositor: grade curada de emojis Unicode por categoria
// (sem dependencia externa). Clicar chama onEscolher — o WhatsApp renderiza os
// emojis nativamente, entao no backend e apenas texto.
import { X } from "lucide-react";

const EMOJIS: { cat: string; itens: string[] }[] = [
  {
    cat: "Rostos",
    itens: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🙂", "🙃", "😉", "😊", "😇",
      "🥰", "😍", "😘", "😋", "😎", "🤩", "🥳", "😏", "😌", "😔", "😴", "😅",
      "🤔", "🤗", "🤭", "😱", "😳", "🥺", "😢", "😭", "😤", "😡", "🙄", "😬",
    ],
  },
  {
    cat: "Gestos",
    itens: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤙", "👏", "🙌", "🤝", "🙏", "💪",
      "👋", "🤚", "👐", "👇", "👉", "👈", "☝️", "✋",
    ],
  },
  {
    cat: "Coracao",
    itens: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞",
      "💓", "💗", "💖", "💘", "💝", "💯", "✨", "🔥",
    ],
  },
  {
    cat: "Objetos",
    itens: [
      "✅", "❌", "⚠️", "⭐", "🎉", "🎊", "🎁", "📦", "🛒", "💰", "💳", "🏷️",
      "📌", "📎", "📱", "💬", "📅", "⏰", "🚀", "📢",
    ],
  },
  {
    cat: "Casa e clima",
    itens: [
      "🏠", "🏢", "❄️", "☀️", "🌡️", "💧", "🌬️", "🔧", "🛠️", "⚡", "🧊", "♻️",
      "🌎", "🌟", "🤖", "📈", "🥇", "🏆", "🎯", "👀",
    ],
  },
];

export function SeletorEmoji({
  onEscolher,
  onFechar,
}: {
  onEscolher: (emoji: string) => void;
  onFechar: () => void;
}) {
  return (
    <div className="absolute bottom-full left-3 z-20 mb-1 w-72 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
          Emojis
        </p>
        <button
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded p-0.5 text-medio/50 hover:bg-black/5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="scroll-fino max-h-60 overflow-y-auto p-2">
        {EMOJIS.map((g) => (
          <div key={g.cat} className="mb-2 last:mb-0">
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-medio/40">
              {g.cat}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {g.itens.map((e, i) => (
                <button
                  key={`${g.cat}-${i}`}
                  type="button"
                  onClick={() => onEscolher(e)}
                  className="flex h-8 items-center justify-center rounded text-lg leading-none hover:bg-fundo"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
