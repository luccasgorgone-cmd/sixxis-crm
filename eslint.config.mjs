import nextConfig from "eslint-config-next";

// Burndown de lint (WORKORDER Toolkit, Fase 4, 15/08/2026) — baseline real
// tirado com `npx eslint .` no dia da introducao deste arquivo:
//   react-hooks/set-state-in-effect: 101 erros em 80 arquivos (backlog)
//   react/no-unescaped-entities: 4 -> 0 (corrigido)
//   react-hooks/refs: 4 -> 0 (corrigido, ref movida pra useEffect)
//   react-hooks/purity: 2 -> 0 (corrigido, Date.now() tirado do render)
// react-hooks/exhaustive-deps ja estava em 0 violacoes na baseline —
// promovido de "warn" (padrao do eslint-config-next) para "error" pra travar
// esse ganho e nao deixar regressao silenciosa entrar.
const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "src/generated/**",
    ],
  },
  {
    rules: {
      "react-hooks/exhaustive-deps": "error",
      // Backlog conhecido e datado (nao ignorado em silencio): rebaixado pra
      // warn so pra nao travar o burndown das outras regras nem o pre-commit
      // enquanto o refactor arquitetural dos 80 arquivos nao acontece —
      // decisao de quando fazer esse refactor e do Luccas (Artigo 14).
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
