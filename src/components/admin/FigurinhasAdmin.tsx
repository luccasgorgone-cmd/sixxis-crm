"use client";

// Admin > Figurinhas: sobe imagens (figurinhas da Sixxis) para o R2 e remove.
// As figurinhas ativas ficam disponiveis no compositor do Inbox. Reusa o upload
// R2 via POST /api/admin/figurinhas (multipart).
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, Loader2, Sticker } from "lucide-react";
import { Cabecalho } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

type Figurinha = {
  id: string;
  nome: string;
  url: string;
  ativo: boolean;
  ordem: number;
};

export function FigurinhasAdmin() {
  const toast = useToast();
  const [figurinhas, setFigurinhas] = useState<Figurinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/figurinhas");
      if (r.ok) {
        setFigurinhas((await r.json()).figurinhas ?? []);
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (arquivos.length === 0) return;
    setEnviando(true);
    let falhou = false;
    for (const f of arquivos) {
      const fd = new FormData();
      fd.append("arquivo", f);
      fd.append("nome", f.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Figurinha");
      try {
        const r = await fetch("/api/admin/figurinhas", { method: "POST", body: fd });
        if (!r.ok) falhou = true;
      } catch {
        falhou = true;
      }
    }
    setEnviando(false);
    if (falhou) toast.erro("Uma ou mais figurinhas nao foram enviadas.");
    else toast.sucesso("Figurinha(s) adicionada(s).");
    await carregar();
  }

  async function remover(id: string) {
    // Otimista.
    setFigurinhas((prev) => prev.filter((f) => f.id !== id));
    try {
      const r = await fetch(`/api/admin/figurinhas/${id}`, { method: "DELETE" });
      if (!r.ok) {
        toast.erro("Nao foi possivel remover.");
        await carregar();
      }
    } catch {
      toast.erro("Falha de conexao.");
      await carregar();
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Cabecalho
        titulo="Figurinhas"
        subtitulo="Imagens que os atendentes podem enviar no Inbox. Adicione ou remova."
        acao={
          <button
            onClick={() => arquivoRef.current?.click()}
            disabled={enviando}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Adicionar figurinha
          </button>
        }
      />

      <input
        ref={arquivoRef}
        type="file"
        accept="image/*"
        multiple
        onChange={subir}
        className="hidden"
      />

      {erro ? (
        <EstadoErro mensagem="Nao foi possivel carregar as figurinhas." onRetry={carregar} />
      ) : carregando ? (
        <div className="flex items-center justify-center py-16 text-medio/50">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : figurinhas.length === 0 ? (
        <EmptyState
          icone={Sticker}
          titulo="Nenhuma figurinha"
          texto="Adicione imagens (PNG/WebP) para os atendentes enviarem no Inbox."
        />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {figurinhas.map((f) => (
            <div
              key={f.id}
              className="group relative flex aspect-square items-center justify-center rounded-xl border border-black/5 bg-white p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={f.nome}
                title={f.nome}
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
              <button
                onClick={() => void remover(f.id)}
                title="Remover"
                aria-label="Remover figurinha"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-medio opacity-0 shadow-sm transition-opacity hover:text-erro group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
