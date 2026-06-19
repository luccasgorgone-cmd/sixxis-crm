// Perfil/supervisao do colaborador. Rota preparada; a supervisao detalhada
// (timeline, conversas, intervir) vem na 2.6.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agente = await prisma.agente.findUnique({
    where: { id },
    select: { nome: true, email: true },
  });

  return (
    <div className="p-6">
      <Link
        href="/admin/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-medio hover:text-escuro"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao painel
      </Link>
      <h2 className="text-lg font-semibold text-escuro">
        {agente?.nome ?? "Colaborador"}
      </h2>
      <p className="text-sm text-medio/60">{agente?.email}</p>
      <div className="mt-6 rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-medio/50">
        Supervisao detalhada do colaborador chega na proxima fatia (2.6).
      </div>
    </div>
  );
}
