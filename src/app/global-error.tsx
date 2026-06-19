'use client';

export const dynamic = "force-dynamic";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <h2>Algo deu errado</h2>
        <button onClick={() => reset()}>Tentar novamente</button>
      </body>
    </html>
  );
}
