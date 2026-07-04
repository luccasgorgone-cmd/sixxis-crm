"use client";

// Barra superior do Kanban: busca, filtros (etiqueta, temperatura) e, para
// ADMIN, alternador Meus/Todos/Sem dono + filtro por vendedor.
import { Search } from "lucide-react";
import type {
  EtiquetaChip,
  AgenteResumo,
  Temperatura,
  FiltroDono,
} from "./tipos";
import { TEMPERATURA_INFO } from "./tipos";

const DONOS: { chave: FiltroDono; rotulo: string }[] = [
  { chave: "meus", rotulo: "Meus" },
  { chave: "todos", rotulo: "Todos" },
  { chave: "sem_dono", rotulo: "Sem dono" },
];

export function BarraFiltros({
  ehAdmin,
  busca,
  etiquetaId,
  temperatura,
  filtroDono,
  agenteId,
  etiquetas,
  agentes,
  mostrarTemperatura = true,
  onBusca,
  onEtiqueta,
  onTemperatura,
  onFiltroDono,
  onAgente,
}: {
  ehAdmin: boolean;
  busca: string;
  etiquetaId: string;
  temperatura: string;
  filtroDono: FiltroDono;
  agenteId: string;
  etiquetas: EtiquetaChip[];
  agentes: AgenteResumo[];
  // Pos-venda nao usa temperatura -> esconde o filtro.
  mostrarTemperatura?: boolean;
  onBusca: (v: string) => void;
  onEtiqueta: (v: string) => void;
  onTemperatura: (v: string) => void;
  onFiltroDono: (v: FiltroDono) => void;
  onAgente: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-white px-4 py-2.5">
      <div className="flex min-w-50 flex-1 items-center gap-2 rounded-lg border border-black/10 bg-fundo px-3 sm:max-w-xs">
        <Search className="h-4 w-4 text-medio/50" />
        <input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar cliente, telefone ou mensagem"
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
      </div>

      <select
        value={etiquetaId}
        onChange={(e) => onEtiqueta(e.target.value)}
        className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-escuro outline-none focus:border-tiffany"
      >
        <option value="">Todas etiquetas</option>
        {etiquetas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>

      {mostrarTemperatura && (
        <select
          value={temperatura}
          onChange={(e) => onTemperatura(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-escuro outline-none focus:border-tiffany"
        >
          <option value="">Toda temperatura</option>
          {(Object.keys(TEMPERATURA_INFO) as Temperatura[]).map((t) => (
            <option key={t} value={t}>
              {TEMPERATURA_INFO[t].rotulo}
            </option>
          ))}
        </select>
      )}

      {ehAdmin && (
        <>
          <div className="flex overflow-hidden rounded-lg border border-black/10">
            {DONOS.map((d) => (
              <button
                key={d.chave}
                onClick={() => onFiltroDono(d.chave)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  filtroDono === d.chave
                    ? "bg-tiffany text-white"
                    : "bg-white text-medio hover:bg-black/5"
                }`}
              >
                {d.rotulo}
              </button>
            ))}
          </div>

          <select
            value={agenteId}
            onChange={(e) => onAgente(e.target.value)}
            disabled={filtroDono !== "todos"}
            className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-escuro outline-none focus:border-tiffany disabled:opacity-50"
          >
            <option value="">Todos vendedores</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
