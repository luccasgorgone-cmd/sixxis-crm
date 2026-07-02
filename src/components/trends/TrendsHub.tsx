"use client";

// Aba Google Trends: hub de demanda. Reune (1) links ao Google Trends por
// categoria (o Trends nao tem API oficial e bloqueia datacenter -> so links, que
// abrem no site do Google), (2) Tendencias do Mercado Livre (OAuth, atras de
// "Conectar") e (3) a demanda interna do CRM (ancora que nunca falha). Nesta
// Parte 1 so a secao de links; ML e demanda interna entram nas Partes 2 e 3.
import { TrendingUp, ExternalLink, Fan, Bike, Wind, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/inteligencia/Reveal";

const BASE_TRENDS = "https://trends.google.com/trends/explore?geo=BR&hl=pt-BR&q=";
function urlTrends(termo: string): string {
  return BASE_TRENDS + encodeURIComponent(termo);
}

const CATEGORIAS_TRENDS: {
  rotulo: string;
  icon: LucideIcon;
  termos: string[];
}[] = [
  {
    rotulo: "Climatizadores",
    icon: Fan,
    termos: [
      "climatizador",
      "climatizador de ar",
      "climatizador evaporativo",
      "ar condicionado portatil",
      "ventilador",
    ],
  },
  {
    rotulo: "Bikes de Spinning",
    icon: Bike,
    termos: ["bike spinning", "bicicleta ergometrica", "spinning", "bike indoor"],
  },
  {
    rotulo: "Aspiradores",
    icon: Wind,
    termos: [
      "aspirador de po",
      "aspirador vertical",
      "aspirador robo",
      "aspirador de po e agua",
    ],
  },
];

export function TrendsHub() {
  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-escuro">Google Trends</h2>
        <p className="text-sm text-medio/60">
          Sinais de demanda por categoria: interesse de busca, tendencias do
          Mercado Livre e o dado interno do seu CRM.
        </p>
      </div>

      <SecaoGoogleTrends />
    </div>
  );
}

function SecaoGoogleTrends() {
  return (
    <Reveal>
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-tiffany" />
          <p className="text-sm font-semibold text-escuro">
            Interesse de busca (Google Trends)
          </p>
        </div>
        <p className="mb-3 text-xs text-medio/60">
          Tendencia de buscas no Brasil por termo. Cada botao abre no site do
          Google Trends, fora do CRM.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {CATEGORIAS_TRENDS.map((cat) => (
            <div
              key={cat.rotulo}
              className="flex flex-col gap-2 rounded-lg border border-black/5 bg-fundo p-3"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tiffany/10">
                  <cat.icon className="h-4 w-4 text-tiffany" />
                </div>
                <span className="text-sm font-semibold text-escuro">
                  {cat.rotulo}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.termos.map((termo) => (
                  <a
                    key={termo}
                    href={urlTrends(termo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Ver "${termo}" no Google Trends`}
                    className="flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                  >
                    {termo}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
