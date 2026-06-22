// Logo da marca. Se a empresa configurou uma logo (temLogo), renderiza a imagem
// servida por /api/logo (com cache-busting por logoEm). Senao, mantem a
// identidade textual Sixxis ("sixxis" com o ponto tiffany).
export function Logo({
  className = "",
  tom = "escuro",
  temLogo = false,
  logoEm = 0,
  nomeEmpresa = null,
  // Altura da imagem da logo (Tailwind). Ex.: "h-8". Largura e auto.
  alturaImg = "h-8",
}: {
  className?: string;
  tom?: "escuro" | "claro";
  temLogo?: boolean;
  logoEm?: number;
  nomeEmpresa?: string | null;
  alturaImg?: string;
}) {
  if (temLogo) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/logo?v=${logoEm}`}
          alt={nomeEmpresa ?? "Logo"}
          className={`${alturaImg} w-auto max-w-full object-contain`}
        />
      </span>
    );
  }

  const corTexto = tom === "claro" ? "text-white" : "text-escuro";
  return (
    <span
      className={`inline-flex items-baseline gap-0.5 font-semibold tracking-tight ${corTexto} ${className}`}
    >
      <span className="text-tiffany">sixxis</span>
      <span className="text-sm font-medium opacity-70">CRM</span>
    </span>
  );
}
