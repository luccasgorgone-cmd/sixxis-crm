"use client";

// Aba Trends: hub de ATALHOS para o Google Trends (interesse de busca por termo).
// Somente links (o CRM nao raspa nem inventa numero): cada termo abre no Google
// Trends, em nova aba, fora do CRM.
import {
  TrendingUp,
  ExternalLink,
  Fan,
  Bike,
  Wind,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/inteligencia/Reveal";

// URL de exploracao do Google Trends (Brasil, pt-BR) por termo.
function urlTrends(termo: string): string {
  return (
    "https://trends.google.com/trends/explore?geo=BR&hl=pt-BR&q=" +
    encodeURIComponent(termo)
  );
}

const CATEGORIAS: { rotulo: string; icon: LucideIcon; termos: string[] }[] = [
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

// Atalhos gerais (nao por termo): panorama de demanda no Brasil, tambem no Trends.
const ATALHOS_GERAIS: { rotulo: string; url: string; descricao: string }[] = [
  {
    rotulo: "Google Trends — Em alta no Brasil",
    url: "https://trends.google.com/trending?geo=BR&hl=pt-BR",
    descricao: "Assuntos em alta agora, Brasil inteiro.",
  },
  {
    rotulo: "Comparar climatizador x ventilador x ar condicionado",
    url:
      "https://trends.google.com/trends/explore?geo=BR&hl=pt-BR&q=" +
      [
        encodeURIComponent("climatizador"),
        encodeURIComponent("ventilador"),
        encodeURIComponent("ar condicionado"),
      ].join(","),
    descricao: "Interesse relativo entre os tres termos no Google Trends.",
  },
];

export function TrendsHub() {
  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-escuro">Trends</h2>
        <p className="text-sm text-medio/60">
          Atalhos para o Google Trends: interesse de busca por termo no Brasil.
          Cada link abre fora do CRM, em nova aba.
        </p>
      </div>

      {/* Categorias x termos (todos abrem no Google Trends) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {CATEGORIAS.map((cat, i) => (
          <Reveal key={cat.rotulo} delay={i * 60}>
            <div className="flex h-full flex-col gap-3 rounded-xl border border-black/5 bg-white p-4">
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
                    title={`Ver "${termo}" no Google Trends — abre fora do CRM`}
                    className="flex items-center gap-1 rounded-full border border-black/10 bg-fundo px-2.5 py-1 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                  >
                    {termo}
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Atalhos gerais */}
      <Reveal delay={180}>
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <div className="mb-1 flex items-center gap-2">
            <Flame className="h-4 w-4 text-tiffany" />
            <p className="text-sm font-semibold text-escuro">
              Panorama de demanda
            </p>
          </div>
          <p className="mb-3 text-xs text-medio/60">
            Visao ampla de tendencias no Brasil. Abre no Google Trends, fora do
            CRM.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ATALHOS_GERAIS.map((a) => (
              <a
                key={a.rotulo}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded-lg border border-black/5 bg-fundo p-3 transition-colors hover:border-tiffany"
              >
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-tiffany" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-medium text-escuro">
                    {a.rotulo}
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                  </span>
                  <span className="mt-0.5 block text-xs text-medio/60">
                    {a.descricao}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
