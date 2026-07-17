"use client";

// Coluna esquerda da inbox: busca, filtros e a lista de conversas.
import { useState } from "react";
import {
  Search,
  Bot,
  User as UserIcon,
  Inbox as InboxIcon,
  SearchX,
  Pin,
  PinOff,
  MoreVertical,
  CircleDot,
} from "lucide-react";
import type { ConversaItem, Filtro, Finalidade } from "./tipos";
import { horarioLista } from "@/lib/format";
import { BadgeFinalidade, corFinalidade } from "@/components/BadgeFinalidade";
import { AvatarCliente } from "@/components/AvatarCliente";
import { EstadoErro, EstadoVazio } from "@/components/ui/Estado";
import {
  FiltroPeriodoEntrada,
  type PeriodoEntrada,
} from "@/components/ui/FiltroPeriodoEntrada";

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
  periodo,
  contadorPeriodo,
  onBusca,
  onFiltro,
  onFinalidade,
  onPeriodo,
  onSelecionar,
  onTentar,
  onFixar,
  onMarcarNaoLida,
}: {
  conversas: ConversaItem[];
  carregando: boolean;
  erro: string | null;
  selecionada: string | null;
  busca: string;
  filtro: Filtro;
  finalidade: Finalidade | "";
  mostrarFinalidade: boolean;
  periodo: PeriodoEntrada;
  contadorPeriodo?: number;
  onBusca: (v: string) => void;
  onFiltro: (f: Filtro) => void;
  onFinalidade: (f: Finalidade | "") => void;
  onPeriodo: (v: PeriodoEntrada) => void;
  onSelecionar: (id: string) => void;
  onTentar?: () => void;
  // Fatia Y: acoes rapidas do item (fixar/desafixar, marcar nao lida).
  onFixar?: (id: string) => void;
  onMarcarNaoLida?: (id: string) => void;
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
            placeholder="Buscar por nome, telefone ou mensagem"
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
        {/* Periodo por entrada do atendimento (quando a conversa entrou). */}
        <div className="mt-2">
          <FiltroPeriodoEntrada
            valor={periodo}
            onChange={onPeriodo}
            contador={contadorPeriodo}
          />
        </div>
      </div>

      {/* Lista */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
        {carregando ? (
          <SkeletonLista />
        ) : erro ? (
          <EstadoErro mensagem={erro} onRetry={onTentar} compacto />
        ) : conversas.length === 0 ? (
          busca.trim() || filtro !== "todas" ? (
            <EstadoVazio
              icone={SearchX}
              titulo="Nenhum resultado"
              texto={
                busca.trim()
                  ? `Nada encontrado para "${busca.trim()}".`
                  : "Nenhuma conversa com esse filtro."
              }
              compacto
            />
          ) : (
            <EstadoVazio
              icone={InboxIcon}
              titulo="Nenhuma conversa"
              texto="As conversas aparecem aqui conforme os clientes entram em contato."
              compacto
            />
          )
        ) : (
          conversas.map((c) => (
            <ItemConversa
              key={c.id}
              conversa={c}
              ativa={c.id === selecionada}
              onClick={() => onSelecionar(c.id)}
              onFixar={onFixar}
              onMarcarNaoLida={onMarcarNaoLida}
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
  onFixar,
  onMarcarNaoLida,
}: {
  conversa: ConversaItem;
  ativa: boolean;
  onClick: () => void;
  onFixar?: (id: string) => void;
  onMarcarNaoLida?: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const nome = conversa.leadNome?.trim() || conversa.leadTelefone;
  const cor = conversa.finalidade ? corFinalidade(conversa.finalidade) : null;
  const fixada = Boolean(conversa.fixadaEm);
  // Fatia Y: acoes so fazem sentido na lista real do Inbox (tem callbacks).
  const temAcoes = Boolean(onFixar || onMarcarNaoLida);

  return (
    // Div clicavel (nao <button>) para permitir os botoes de acao aninhados.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={cor ? { borderLeftColor: cor.hex } : undefined}
      className={`group relative flex w-full cursor-pointer items-center gap-3 border-b border-l-[3px] border-black/5 px-3 py-3 text-left transition-colors ${
        ativa ? "bg-tiffany/10" : "hover:bg-fundo"
      }`}
    >
      <div className="relative shrink-0">
        <AvatarCliente
          nome={conversa.leadNome}
          telefone={conversa.leadTelefone}
          fotoUrl={conversa.leadFoto}
          tamanho={44}
        />
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
          <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-escuro">
            {fixada && (
              <Pin
                className="h-3 w-3 shrink-0 text-medio/50"
                aria-label="Conversa fixada"
              />
            )}
            <span className="truncate">{nome}</span>
          </p>
          {/* Horario some no hover para dar lugar ao botao de acoes. */}
          <span
            className={`shrink-0 text-[11px] text-medio/50 ${
              temAcoes ? "transition-opacity group-hover:opacity-0" : ""
            }`}
          >
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
          {/* Indicador de nao-lida: contador automatico OU ponto da marcacao manual. */}
          {conversa.naoLidas > 0 ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-tiffany px-1.5 text-[11px] font-semibold text-white">
              {conversa.naoLidas > 99 ? "99+" : conversa.naoLidas}
            </span>
          ) : conversa.marcadaNaoLida ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-tiffany"
              title="Marcada como nao lida"
              aria-label="Nao lida"
            />
          ) : null}
        </div>
        {conversa.trechoBusca && (
          <p
            className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-tiffany"
            title={conversa.trechoBusca}
          >
            <Search className="h-3 w-3 shrink-0" />
            <span className="truncate">{conversa.trechoBusca}</span>
          </p>
        )}
      </div>

      {/* Acoes rapidas (fixar / marcar nao lida). */}
      {temAcoes && (
        <div
          className="absolute right-1.5 top-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-label="Acoes da conversa"
            aria-expanded={menu}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-medio/60 transition-colors hover:bg-black/5 hover:text-escuro ${
              menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && (
            <>
              {/* Camada para fechar ao clicar fora. */}
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg">
                {onFixar && (
                  <button
                    type="button"
                    onClick={() => {
                      onFixar(conversa.id);
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-escuro hover:bg-fundo"
                  >
                    {fixada ? (
                      <PinOff className="h-4 w-4 text-medio/60" />
                    ) : (
                      <Pin className="h-4 w-4 text-medio/60" />
                    )}
                    {fixada ? "Desafixar" : "Fixar"}
                  </button>
                )}
                {onMarcarNaoLida && (
                  <button
                    type="button"
                    onClick={() => {
                      onMarcarNaoLida(conversa.id);
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-escuro hover:bg-fundo"
                  >
                    <CircleDot className="h-4 w-4 text-medio/60" />
                    Marcar como nao lida
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
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
