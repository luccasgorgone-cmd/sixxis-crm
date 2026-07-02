"use client";

// Aba Trends: hub de ATALHOS para pesquisa externa de interesse/preco/demanda.
// Somente links (o CRM nao raspa nem inventa numero): cada termo abre em varias
// ferramentas (Google Trends, Google Shopping, Mercado Livre, Amazon) em nova aba.
//
// NOTA DE PRODUTO: a integracao Mercado Livre por API (OAuth + /api/trends/
// mercadolivre + model IntegracaoMercadoLivre + lib/mercadolivre.ts) foi
// DESATIVADA da UI por decisao do dono (2.45-C). O backend segue dormante para
// uso futuro; aqui usamos apenas o link de NAVEGACAO do ML (lista.mercadolivre),
// que mostra anuncios/precos reais sem depender da API.
import {
  TrendingUp,
  ExternalLink,
  Fan,
  Bike,
  Wind,
  ShoppingCart,
  ShoppingBag,
  Package,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/inteligencia/Reveal";

// ---- Destinos externos: cada um monta uma URL de busca por termo ----
// Slug do Mercado Livre: caminho de navegacao (espacos viram hifens).
function slugML(termo: string): string {
  return encodeURIComponent(termo.trim()).replace(/%20/g, "-");
}

type Destino = {
  rotulo: string;
  icon: LucideIcon;
  url: (termo: string) => string;
  descricao: string;
};

const DESTINOS: Destino[] = [
  {
    rotulo: "Trends",
    icon: TrendingUp,
    descricao: "Interesse de busca no tempo (Google Trends)",
    url: (t) =>
      "https://trends.google.com/trends/explore?geo=BR&hl=pt-BR&q=" +
      encodeURIComponent(t),
  },
  {
    rotulo: "Shopping",
    icon: ShoppingCart,
    descricao: "Precos e ofertas (Google Shopping)",
    url: (t) => "https://www.google.com/search?tbm=shop&q=" + encodeURIComponent(t),
  },
  {
    rotulo: "Mercado Livre",
    icon: ShoppingBag,
    descricao: "Anuncios e precos no Mercado Livre",
    url: (t) => "https://lista.mercadolivre.com.br/" + slugML(t),
  },
  {
    rotulo: "Amazon",
    icon: Package,
    descricao: "Anuncios e precos na Amazon Brasil",
    url: (t) => "https://www.amazon.com.br/s?k=" + encodeURIComponent(t),
  },
];

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

// Atalhos gerais (nao por termo): panorama de demanda no Brasil.
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
          Atalhos para pesquisar interesse, preco e demanda em ferramentas
          externas. Cada link abre fora do CRM, em nova aba.
        </p>
      </div>

      {/* Legenda dos destinos */}
      <Reveal>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-black/5 bg-white px-4 py-3">
          <span className="text-xs font-medium text-medio/70">Destinos:</span>
          {DESTINOS.map((d) => (
            <span
              key={d.rotulo}
              title={d.descricao}
              className="flex cursor-help items-center gap-1.5 text-xs text-medio/70"
            >
              <d.icon className="h-3.5 w-3.5 text-tiffany" />
              {d.rotulo}
            </span>
          ))}
        </div>
      </Reveal>

      {/* Categorias x termos x destinos */}
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

              <div className="space-y-2.5">
                {cat.termos.map((termo) => (
                  <div
                    key={termo}
                    className="rounded-lg border border-black/5 bg-fundo p-2.5"
                  >
                    <p className="mb-1.5 text-xs font-medium text-escuro">
                      {termo}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DESTINOS.map((d) => (
                        <a
                          key={d.rotulo}
                          href={d.url(termo)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${d.descricao} — abre fora do CRM`}
                          className="flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                        >
                          <d.icon className="h-3 w-3" />
                          {d.rotulo}
                          <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                        </a>
                      ))}
                    </div>
                  </div>
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
