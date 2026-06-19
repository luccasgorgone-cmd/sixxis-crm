// Logo textual da marca. "sixxis" com o ponto tiffany. Sem imagem externa
// para nao depender de asset nesta fase.
export function Logo({
  className = "",
  tom = "escuro",
}: {
  className?: string;
  tom?: "escuro" | "claro";
}) {
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
