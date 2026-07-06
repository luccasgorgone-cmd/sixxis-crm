"use client";

// Formulario de login (client): chama signIn() do next-auth/react e trata o erro
// inline. Em sucesso, vai para callbackUrl. A marca (logo/nome) vem por props do
// server, sem flash.
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Lock, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import type { Marca } from "@/lib/marca";

export function LoginForm({ marca }: { marca: Marca }) {
  // useSearchParams exige fronteira de Suspense para o prerender.
  return (
    <Suspense>
      <Form marca={marca} />
    </Suspense>
  );
}

function Form({ marca }: { marca: Marca }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await signIn("credentials", {
        email,
        senha,
        redirect: false,
      });
      if (!res || res.error) {
        setErro("Email ou senha invalidos.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErro("Nao foi possivel entrar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          {marca.temLogo ? (
            // A logo da marca e feita para a superficie ESCURA (sidebar): sobre o
            // fundo claro do login ela sumia (contraste). Aqui a colocamos sobre a
            // MESMA superficie escura da sidebar (bg-escuro + tom claro), onde ela
            // renderiza corretamente em ambos os temas. Fatia 3.14.
            <div className="flex items-center justify-center rounded-2xl bg-escuro px-6 py-4 shadow-sm">
              <Logo
                temLogo
                logoEm={marca.logoEm}
                nomeEmpresa={marca.nomeEmpresa}
                tom="claro"
                alturaImg="h-12"
              />
            </div>
          ) : (
            <Logo className="text-3xl" nomeEmpresa={marca.nomeEmpresa} />
          )}
          <p className="text-sm text-medio/70">Atendimento WhatsApp</p>
        </div>

        <form
          onSubmit={aoEnviar}
          className="rounded-xl border border-black/5 bg-white p-6 shadow-sm"
        >
          <h1 className="mb-5 text-lg font-semibold text-escuro">Entrar</h1>

          <label className="mb-1 block text-sm font-medium text-escuro">
            Email
          </label>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 transition-colors focus-within:border-tiffany">
            <Mail className="h-4 w-4 text-medio/60" />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              placeholder="voce@sixxis.com"
            />
          </div>

          <label className="mb-1 block text-sm font-medium text-escuro">
            Senha
          </label>
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 transition-colors focus-within:border-tiffany">
            <Lock className="h-4 w-4 text-medio/60" />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              placeholder="********"
            />
          </div>

          {erro && (
            <p className="mb-4 rounded-lg bg-erro/10 px-3 py-2 text-sm text-erro">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-tiffany py-2.5 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-medio/50">
          {marca.nomeEmpresa ?? "Sixxis"} CRM &middot; acesso restrito
        </p>
      </div>
    </main>
  );
}
