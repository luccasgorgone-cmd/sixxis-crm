"use client";

// Admin > Meta / Pixel: Pixel ID + token do Conversions API + codigo de teste
// (test_event_code) e botao "Testar conexao". O token nunca volta do servidor
// (mostramos apenas se ha um salvo). Ao marcar GANHO+venda, o evento Purchase e
// enviado ao Meta com a atribuicao do anuncio (ctwaClid).
import { useEffect, useState, useCallback } from "react";
import { Loader2, Save, Plug, CheckCircle2, XCircle } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { useToast } from "@/components/ui/Toast";

export function MetaPixelAdmin() {
  const toast = useToast();
  const [carregando, setCarregando] = useState(true);
  const [pixelId, setPixelId] = useState("");
  const [token, setToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [temToken, setTemToken] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/meta");
      if (r.ok) {
        const d = await r.json();
        setPixelId(d.pixelId ?? "");
        setTestEventCode(d.testEventCode ?? "");
        setTemToken(!!d.temToken);
      }
    } catch {
      /* silencioso */
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    const r = await fetch("/api/admin/meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pixelId, token, testEventCode }),
    });
    setSalvando(false);
    if (r.ok) {
      toast.sucesso("Configuracao salva");
      setToken("");
      await carregar();
    } else {
      toast.erro("Nao foi possivel salvar.");
    }
  }

  async function testar() {
    setTestando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/admin/meta/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId, token }),
      });
      const d = await r.json().catch(() => null);
      if (d?.ok) {
        setResultado({ ok: true, msg: "Conexao OK com a Graph API." });
      } else {
        setResultado({ ok: false, msg: d?.motivo ?? "Falha na conexao." });
      }
    } catch {
      setResultado({ ok: false, msg: "Falha de rede." });
    } finally {
      setTestando(false);
    }
  }

  if (carregando) {
    return (
      <div className="p-6">
        <SkeletonTabela />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Meta / Pixel (Conversions API)"
        subtitulo="Atribuicao de vendas de anuncios Click-to-WhatsApp. Ao marcar GANHO com valor, o evento Purchase e enviado ao Meta (server-side) com o ctwaClid."
      />

      <div className="max-w-lg space-y-4 rounded-xl border border-black/5 bg-white p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-escuro">Pixel ID</label>
          <input
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="Ex.: 123456789012345"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-escuro">
            Token do Conversions API
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={temToken ? "•••••••• (mantem o atual se vazio)" : "Cole o token"}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
          <p className="mt-1 text-[11px] text-medio/50">
            {temToken ? "Ha um token salvo." : "Nenhum token salvo ainda."} O token
            nao e exibido por seguranca.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-escuro">
            Codigo de teste (test_event_code) — opcional
          </label>
          <input
            value={testEventCode}
            onChange={(e) => setTestEventCode(e.target.value)}
            placeholder="Ex.: TEST12345 (modo de teste do Gerenciador de Eventos)"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
          <p className="mt-1 text-[11px] text-medio/50">
            Com este codigo, os eventos aparecem em "Eventos de teste" e nao contam
            como conversao real. Deixe vazio em producao.
          </p>
        </div>

        {resultado && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              resultado.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {resultado.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {resultado.msg}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => void testar()}
            disabled={testando}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-medio hover:bg-black/5 disabled:opacity-60"
          >
            {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Testar conexao
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
