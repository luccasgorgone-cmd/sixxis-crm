// Registro das ferramentas de ESCRITA do Supervisor (SPEC §6). Única fonte da
// verdade de "o que o supervisor pode propor". Toda escrita aqui é Nível 1:
// reversível, baixo risco, human-in-the-loop (propõe → admin confirma → executa).
//
// LINHA VERMELHA ESTRUTURAL (§2): NÃO existe ferramenta de envio de mensagem a
// cliente. O supervisor é consultor interno — mexe no CRM, nunca fala com o
// cliente. `FERRAMENTAS_PROIBIDAS` lista nomes que, se um dia aparecerem no
// registro, devem quebrar na carga (ver assertParseSemEnvio()). Isso é testado
// no contrato (scripts/contratos) e aqui em tempo de import.
import type { FerramentaEscrita } from "./tipos";
import { moverEtapa } from "./mover_etapa";
import { registrarGanho } from "./registrar_ganho";
import { registrarPerda } from "./registrar_perda";
import { criarLembrete } from "./criar_lembrete";
import { criarNota } from "./criar_nota";
import { reatribuirVendedor } from "./reatribuir_vendedor";
import { arquivarNegocio } from "./arquivar_negocio";

// Ordem estável (vira a ordem das tools apresentadas ao provider).
export const FERRAMENTAS_ESCRITA: FerramentaEscrita[] = [
  moverEtapa,
  registrarGanho,
  registrarPerda,
  criarLembrete,
  criarNota,
  reatribuirVendedor,
  arquivarNegocio,
];

// Prefixos/nomes que denunciam uma ferramenta de comunicação externa. Linha
// vermelha: nenhuma ferramenta de escrita pode se chamar assim.
const PADROES_PROIBIDOS = [
  "enviar",
  "mensagem",
  "whatsapp",
  "responder",
  "notificar_cliente",
  "disparar",
  "email",
  "sms",
];

// Garante, na carga do módulo, que nenhuma ferramenta registrada é de envio ao
// cliente. Lança se a invariante for violada (falha-rápido no boot/teste).
function assertSemEnvioAoCliente(ferramentas: FerramentaEscrita[]): void {
  for (const f of ferramentas) {
    const nome = f.nome.toLowerCase();
    for (const proibido of PADROES_PROIBIDOS) {
      if (nome.includes(proibido)) {
        throw new Error(
          `[supervisor] ferramenta proibida no registro: "${f.nome}" ` +
            `(casa com "${proibido}"). O supervisor não fala com o cliente.`,
        );
      }
    }
  }
}

assertSemEnvioAoCliente(FERRAMENTAS_ESCRITA);

// Índice por nome para o harness de confirmação resolver a ferramenta da proposta.
const POR_NOME = new Map<string, FerramentaEscrita>(
  FERRAMENTAS_ESCRITA.map((f) => [f.nome, f]),
);

export function acharFerramenta(nome: string): FerramentaEscrita | null {
  return POR_NOME.get(nome) ?? null;
}

// Nomes válidos (para validar a proposta do LLM antes de persistir).
export function nomesFerramentas(): string[] {
  return FERRAMENTAS_ESCRITA.map((f) => f.nome);
}

// Reexporta para o contrato/isolamento testar a invariante sem reimplementar.
export { assertSemEnvioAoCliente, PADROES_PROIBIDOS };
