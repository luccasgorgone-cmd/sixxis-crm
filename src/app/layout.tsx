import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { obterMarca } from "@/lib/marca";

// Inter nos pesos usados pela UI. A variavel alimenta --font-inter no CSS.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

// Titulo da aba = nome da empresa (se houver). Favicon: prioriza o PNG dedicado
// (upload no admin); senao cai no derivado da logo; senao o padrao do app.
export async function generateMetadata(): Promise<Metadata> {
  const { nomeEmpresa, temLogo, logoEm, temFavicon, faviconEm } =
    await obterMarca();
  const titulo = nomeEmpresa ? `${nomeEmpresa} CRM` : "Sixxis CRM";
  const iconUrl = temFavicon
    ? `/api/favicon?v=${faviconEm}`
    : temLogo
      ? `/api/logo?v=${logoEm}`
      : null;
  return {
    title: titulo,
    description: nomeEmpresa
      ? `CRM de WhatsApp da ${nomeEmpresa}`
      : "CRM de WhatsApp da Sixxis",
    ...(iconUrl ? { icons: { icon: iconUrl } } : {}),
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <head>
        {/* Aplica o tema (claro/escuro/sistema) ANTES da pintura, sem flash.
            A preferencia fica em localStorage 'tema' (gerida no Topbar). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tema')||'sistema';var d=t==='dark'||(t==='sistema'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
