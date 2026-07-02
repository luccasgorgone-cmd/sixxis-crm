// Escopo de vendedor no client (Mapa/Clima): traduz a escolha do seletor de admin
// nos params que os endpoints ja entendem (mesmos do /api/clientes).
// Valor do seletor: "" (Todos) | <agenteId> | SEM_DONO. Para colaborador o
// seletor nem renderiza e o escopo fica "" — o backend ja escopa por dono.

// Sentinela do seletor para "Sem dono" (orfaos). Vira ?semDono=1.
export const SEM_DONO = "__sem_dono__";

// Params de escopo para as chamadas de API. "" (Todos) -> nenhum param.
export function paramsEscopo(escopo: string): [string, string][] {
  if (!escopo) return [];
  if (escopo === SEM_DONO) return [["semDono", "1"]];
  return [["agenteId", escopo]];
}
