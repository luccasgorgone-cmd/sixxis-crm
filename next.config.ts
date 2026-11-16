import type { NextConfig } from "next";

// Cabecalhos de seguranca basicos em todas as respostas do Next. Sem CSP aqui
// (exigiria inventario de scripts/estilos inline e fontes; fica para um passo
// dedicado). frame-ancestors/X-Frame-Options: o CRM nao e embutido em iframe.
const CABECALHOS_SEGURANCA = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    // Microfone/camera: usados por gravacao de audio e chamadas (self).
    value: "camera=(self), microphone=(self), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // Pacotes nativos/Node que nao devem ser empacotados pelo bundler do Next
  // ao rodar nas rotas de servidor (Prisma 7 + driver pg; sharp = binario nativo
  // usado para converter a logo webp -> PNG no PDF do orcamento, Fatia 3.16).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "sharp"],
  // Nao anunciar a stack (x-powered-by: Next.js).
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: CABECALHOS_SEGURANCA }];
  },
};

export default nextConfig;
