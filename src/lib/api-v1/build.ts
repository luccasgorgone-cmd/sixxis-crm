// Informacoes de build/versao da API de Leitura v1. Usadas em /health e no
// OpenApi. commit vem do ambiente da Railway (RAILWAY_GIT_COMMIT_SHA); nunca
// expoe nada sensivel — so SHA do deploy, versao e horario.

export const VERSAO_API = "1.0.0";

export interface InfoBuild {
  commit: string;
  time: string;
}

export function commitDoDeploy(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT ??
    "desconhecido"
  );
}

export function infoBuild(): InfoBuild {
  return { commit: commitDoDeploy(), time: new Date().toISOString() };
}
