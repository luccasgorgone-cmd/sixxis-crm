// Sistema unico de badges do CRM. Cores DISTINTAS por tipo para distinguir num
// olhar, com contraste adequado. Reutilizar em TODA a UI (cards, listas, painel,
// kanban, supervisao).
//
// TOKENS (cor por tipo):
//  - Finalidade  : venda #3cbfb3 (tiffany) | pos-venda #7c3aed (roxo)   -> BadgeFinalidade
//  - Temperatura : quente vermelho | morno ambar | frio azul            -> BadgeTemperatura
//  - Negocio     : aberto azul | ganho verde | perdido vermelho         -> BadgeStatusNegocio
//  - Atendimento : ao vivo verde | pendente ambar | finalizado cinza    -> BadgeAtendimento
//  - Canal       : whatsapp verde | email azul | sms roxo (com icone)   -> BadgeCanal
//  - Acesso      : venda tiffany | pos-venda roxo | ambos indigo        -> BadgeAcesso
import {
  Radio,
  Clock4,
  CheckCircle2,
  Trophy,
  XCircle,
  CircleDot,
  MessageCircle,
  Mail,
  Smartphone,
  PauseCircle,
  type LucideIcon,
} from "lucide-react";

// Re-exporta os badges ja existentes para um ponto unico de import.
export { BadgeFinalidade, corFinalidade } from "./BadgeFinalidade";
export { BadgeTemperatura } from "./BadgeTemperatura";

function Pill({
  classe,
  icone: Icone,
  children,
  className = "",
}: {
  classe: string;
  icone?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${classe} ${className}`}
    >
      {Icone && <Icone className="h-3 w-3" />}
      {children}
    </span>
  );
}

// ---- Status do negocio ----
const NEGOCIO: Record<string, { rotulo: string; classe: string; icone: LucideIcon }> = {
  ABERTO: { rotulo: "Aberto", classe: "bg-sky-100 text-sky-700", icone: CircleDot },
  GANHO: { rotulo: "Ganho", classe: "bg-green-100 text-green-700", icone: Trophy },
  PERDIDO: { rotulo: "Perdido", classe: "bg-red-100 text-red-700", icone: XCircle },
};

export function BadgeStatusNegocio({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const info = NEGOCIO[status] ?? NEGOCIO.ABERTO;
  return (
    <Pill classe={info.classe} icone={info.icone} className={className}>
      {info.rotulo}
    </Pill>
  );
}

// ---- Pendencia operacional do negocio ----
// Cor propria (laranja) para nao colidir com status/temperatura. O motivo vai
// no tooltip (atributo title) onde o badge aparece.
export function BadgePendente({
  motivo,
  className = "",
}: {
  motivo?: string | null;
  className?: string;
}) {
  return (
    <span
      title={motivo ? `Pendente: ${motivo}` : "Pendente"}
      className={`inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 ${className}`}
    >
      <PauseCircle className="h-3 w-3" />
      Pendente
    </span>
  );
}

// ---- Estado do atendimento (supervisao) ----
const ATENDIMENTO: Record<
  string,
  { rotulo: string; classe: string; icone: LucideIcon }
> = {
  aovivo: { rotulo: "Ao vivo", classe: "bg-green-100 text-green-700", icone: Radio },
  pendente: { rotulo: "Pendente", classe: "bg-amber-100 text-amber-700", icone: Clock4 },
  finalizado: {
    rotulo: "Finalizado",
    classe: "bg-slate-100 text-slate-600",
    icone: CheckCircle2,
  },
};

export function BadgeAtendimento({
  status,
  className = "",
}: {
  status: "aovivo" | "pendente" | "finalizado";
  className?: string;
}) {
  const info = ATENDIMENTO[status] ?? ATENDIMENTO.aovivo;
  return (
    <Pill classe={info.classe} icone={info.icone} className={className}>
      {info.rotulo}
    </Pill>
  );
}

// ---- Canal de contato ----
const CANAL: Record<string, { rotulo: string; classe: string; icone: LucideIcon }> = {
  whatsapp: {
    rotulo: "WhatsApp",
    classe: "bg-green-100 text-green-700",
    icone: MessageCircle,
  },
  email: { rotulo: "Email", classe: "bg-sky-100 text-sky-700", icone: Mail },
  sms: { rotulo: "SMS", classe: "bg-violet-100 text-violet-700", icone: Smartphone },
};

export function BadgeCanal({
  canal,
  className = "",
}: {
  canal: string;
  className?: string;
}) {
  const info = CANAL[canal.toLowerCase()] ?? CANAL.whatsapp;
  return (
    <Pill classe={info.classe} icone={info.icone} className={className}>
      {info.rotulo}
    </Pill>
  );
}

// ---- Acesso/papel ----
const ACESSO: Record<string, string> = {
  Venda: "bg-tiffany/10 text-tiffany",
  "Pos-venda": "bg-violet-100 text-violet-700",
  Ambos: "bg-indigo-100 text-indigo-700",
  Nenhum: "bg-black/5 text-medio/60",
  Administrador: "bg-amber-100 text-amber-700",
};

export function BadgeAcesso({
  acesso,
  className = "",
}: {
  acesso: string;
  className?: string;
}) {
  const classe = ACESSO[acesso] ?? "bg-black/5 text-medio/60";
  return (
    <Pill classe={classe} className={className}>
      {acesso}
    </Pill>
  );
}
