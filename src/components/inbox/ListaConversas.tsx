"use client";

// Coluna esquerda da inbox: busca, filtros e a lista de conversas.
import { Search, Bot, User as UserIcon } from "lucide-react";
import type { ConversaItem, Filtro, Finalidade } from "./tipos";
import { horarioLista, iniciais } from "@/lib/format";
import { BadgeFinalidade, corFinalidade } from "@/components/BadgeFinalidade";

const FILTROS: { chave: Filtro; rotulo: string }[] = [
  { chave: "minhas", rotulo: "Minhas" },
  { chave: "naoLidas", rotulo: "Nao lidas" },
  { chave: "todas", rotulo: "Todas" },
];

const FINALIDADES: { chave: Finalidade | ""; rotulo: string }[] = [
  { chave: "", rotulo: "Todos" },
  { chave: "VENDA", rotulo: "Vendas" },
  { chave: "POS_VENDA", rotulo: "Pos-venda" },
];

export function ListaConversas({
  conversas,
  carregando,
  erro,
  selecionada,
  busca,
  filtro,
  finalidade,
  mostrarFinalidade,
  onBusca,
  onFiltro,
  onFinalidade,
  onSelecionar,
}: {
  conversas: ConversaItem[];
  carregando: boolean;
  erro: string | null;
  selecionada: string | null;
  busca: string;
  filtro: Filtro;
  finalidade: Finalidade | "";
  mostrarFinalidade: boolean;
  onBusca: (v: string) => void;
  onFiltro: (f: Filtro) => void;
  onFinalidade: (f: Finalidade | "") => void;
  onSelecionar: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col border-r border-black/5 bg-white sm:w-80 md:w-96">
      {mostrarFinalidade && (
        <div className="flex gap-1 border-b border-black/5 px-3 pt-2">
          {FINALIDADES.map((f) => (
            <button
              key={f.chave || "todos"}
              onClick={() => onFinalidade(f.chave)}
              className={`border-b-2 px-2.5 py-1.5 text-sm font-medium transition-colors ${
                finalidade === f.chave
                  ? "border-tiffany text-tiffany"
                  : "border-transparent text-medio/60 hover:text-escuro"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      )}
      {/* Busca */}
      <div className="border-b border-black/5 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-fundo px-3 transition-colors focus-within:border-tiffany">
          <Search className="h-4 w-4 text-medio/50" />
          <input
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
        </div>
        <div className="mt-2 flex gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.chave}
              onClick={() => onFiltro(f.chave)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filtro === f.chave
                  ? "bg-tiffany text-white"
                  : "bg-fundo text-medio hover:bg-black/5"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
        {carregando ? (
          <SkeletonLista />
        ) : erro ? (
          <p className="p-4 text-sm text-erro">{erro}</p>
        ) : conversas.length === 0 ? (
          <p className="p-6 text-center text-sm text-medio/60">
            Nenhuma conversa por aqui.
          </p>
        ) : (
          conversas.map((c) => (
            <ItemConversa
              key={c.id}
              conversa={c}
              ativa={c.id === selecionada}
              onClick={() => onSelecionar(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ItemConversa({
  conversa,
  ativa,
  onClick,
}: {
  conversa: ConversaItem;
  ativa: boolean;
  onClick: () => void;
}) {
  const nome = conversa.leadNome?.trim() || conversa.leadTelefone;
  const cor = conversa.finalidade ? corFinalidade(conversa.finalidade) : null;
  return (
    <button
      onClick={onClick}
      style={cor ? { borderLeftColor: cor.hex } : undefined}
      className={`flex w-full items-center gap-3 border-b border-l-[3px] border-black/5 px-3 py-3 text-left transition-colors ${
        ativa ? "bg-tiffany/10" : "hover:bg-fundo"
      }`}
    >
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-medio/10 text-sm font-semibold text-medio">
          {iniciais(conversa.leadNome, conversa.leadTelefone)}
        </div>
        <span
          title={conversa.atendidoPor === "IA" ? "Atendido pela IA" : "Atendido por humano"}
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-white"
        >
          {conversa.atendidoPor === "IA" ? (
            <Bot className="h-3 w-3 text-tiffany" />
          ) : (
            <UserIcon className="h-3 w-3 text-medio/60" />
          )}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-escuro">{nome}</p>
          <span className="shrink-0 text-[11px] text-medio/50">
            {horarioLista(conversa.ultimaMensagemEm)}
          </span>
        </div>
        {(conversa.finalidade || conversa.instanciaNome) && (
          <div className="mb-0.5 flex items-center gap-1.5">
            <BadgeFinalidade finalidade={conversa.finalidade} />
            {conversa.instanciaNome && (
              <span className="truncate text-[10px] text-medio/40">
                {conversa.instanciaNome}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-medio/70">
            {conversa.ultimaMensagemPreview ?? "Sem mensagens"}
          </p>
          {conversa.naoLidas > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-tiffany px-1.5 text-[11px] font-semibold text-white">
              {conversa.naoLidas > 99 ? "99+" : conversa.naoLidas}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function SkeletonLista() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="skeleton h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
