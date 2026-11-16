// Gera docs/api-v1/openapi.json a partir do registro (fonte unica).
// Tambem imprime inventario de recursos + metricas para derivar README/Postman.
import { writeFileSync, mkdirSync } from "node:fs";
import { gerarOpenApi } from "../src/lib/api-v1/openapi";
import { infoBuild, VERSAO_API } from "../src/lib/api-v1/build";
import { listarRecursos, temCampoMensagem } from "../src/lib/api-v1/registro";
import { listarMetricas } from "../src/lib/api-v1/metricas";

(async () => {
  mkdirSync("docs/api-v1", { recursive: true });

  const build = infoBuild();
  const spec = gerarOpenApi(build);
  writeFileSync("docs/api-v1/openapi.json", JSON.stringify(spec, null, 2) + "\n");

  const recursos = listarRecursos();
  const inv = recursos.map((r: any) => {
    const entradas = Object.entries(r.campos ?? {}) as [string, any][];
    return {
      nome: r.nome,
      model: r.model,
      escopo: r.escopo,
      grande: !!r.grande,
      pii: entradas.some(([, d]) => d?.tipo === "pii"),
      msg: temCampoMensagem(r),
      nCampos: entradas.length,
      campos: entradas.map(([k]) => k),
    };
  });

  console.log("INVENTARIO_JSON " + JSON.stringify({
    versao: VERSAO_API,
    recursos: inv,
    metricas: listarMetricas(),
  }));
})();
