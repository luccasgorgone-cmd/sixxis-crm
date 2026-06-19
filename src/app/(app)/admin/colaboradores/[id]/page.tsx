// Perfil/supervisao do colaborador: ao vivo, pendentes, finalizados e inspecao.
import { PerfilColaborador } from "@/components/supervisao/PerfilColaborador";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PerfilColaborador id={id} />;
}
