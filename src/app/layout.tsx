import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter nos pesos usados pela UI. A variavel alimenta --font-inter no CSS.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sixxis CRM",
  description: "CRM de WhatsApp da Sixxis",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
