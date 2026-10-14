// Contrato das ferramentas de ESCRITA do Supervisor (SPEC §6). Toda escrita é
// human-in-the-loop: a IA só devolve uma PROPOSTA {ferramenta, args}; o servidor
// valida (schema + validar), persiste um SupervisorAcao(PROPOSTO) com o preview e
// NÃO executa. A UI mostra o card [Confirmar]/[Descartar]; só no confirmar o
// servidor roda `executar` (que replica a mutação manual + logs) e grava
// antes/depois para o `reverter`. Nenhuma ferramenta aqui envia mensagem a
// cliente — isso é linha vermelha estrutural (§2): o registro (registro.ts) não
// contém nenhuma ferramenta de envio, e não existe caminho para criar uma.
//
// zod NÃO é dependência do projeto (as tools da Luna validam args na mão, com
// JSON Schema para o provider). Seguimos o mesmo padrão: `inputSchema` é o JSON
// Schema que vai pro provider, e `validar` faz a checagem de campo no servidor.

// Admin autenticado que confirma a ação (vem de obterAdmin()). nome entra nos
// logs (HistoricoNegocio/Atividade) como autor, igual ao fluxo manual.
export type AdminCtx = { id: string; nome: string };

// Resultado de validar(): ok, ou motivo legível (vira o erro do card).
export type Validacao = { ok: true } | { ok: false; erro: string };

// Resultado de executar()/reverter(): snapshots para auditoria + undo. `antes` e
// `depois` são gravados em SupervisorAcao.antesJson/depoisJson. Em ferramentas de
// CRIAÇÃO (lembrete, nota) `depois` carrega os ids criados para o reverter apagar.
export type ResultadoExec = {
  ok: boolean;
  erro?: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  negocioId?: string | null;
  leadId?: string | null;
};

// O que o confirmar passa para reverter() (campos do registro SupervisorAcao).
export type RegistroAcao = {
  id: string;
  ferramenta: string;
  argsJson: unknown;
  antesJson: unknown;
  depoisJson: unknown;
  negocioId: string | null;
  leadId: string | null;
};

// Uma ferramenta de escrita Nível 1 (reversível, baixo risco). args chega do LLM
// como objeto solto; cada ferramenta faz o narrowing em validar/executar.
export type Args = Record<string, unknown>;

export type FerramentaEscrita = {
  nome: string;
  titulo: string;
  // Descrição para o LLM (entra no inputSchema.description da tool).
  descricao: string;
  // JSON Schema (mesmo formato de ProviderFerramenta.inputSchema).
  inputSchema: Record<string, unknown>;
  // Texto curto mostrado no card ANTES de confirmar. NÃO escreve nada (pode ler
  // o banco para resolver nomes). Idempotente.
  preview: (args: Args) => Promise<string>;
  // Validação de servidor: existência do alvo, escopo, regras de negócio. Nunca
  // confia no que o LLM mandou além das chaves.
  validar: (args: Args, admin: AdminCtx) => Promise<Validacao>;
  // Executa a mutação replicando o caminho manual (mesmas escritas + logs). A
  // idempotência de "confirmar duas vezes" é garantida pela transição de status
  // em SupervisorAcao no route de confirmar; aqui só fazemos a escrita.
  executar: (args: Args, admin: AdminCtx) => Promise<ResultadoExec>;
  // Desfaz usando o snapshot `antes` (ou apaga as linhas criadas, p/ create).
  reverter: (registro: RegistroAcao, admin: AdminCtx) => Promise<ResultadoExec>;
};

// --- Leitores tolerantes de args do LLM (sem zod). Retornam null quando ausente
// ou do tipo errado; cada validar() decide se null é erro. ---

export function lerTexto(args: Args, chave: string): string | null {
  const v = args[chave];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function lerId(args: Args, chave: string): string | null {
  // ids do CRM são cuid (string não-vazia). Mesmo tratamento de lerTexto.
  return lerTexto(args, chave);
}

export function lerNumero(args: Args, chave: string): number | null {
  const v = args[chave];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
