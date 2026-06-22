// Pagina de login da marca. Server component: le a marca (logo/nome da empresa)
// no servidor e a entrega ao formulario client, sem flash de identidade.
import { obterMarca } from "@/lib/marca";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const marca = await obterMarca();
  return <LoginForm marca={marca} />;
}
