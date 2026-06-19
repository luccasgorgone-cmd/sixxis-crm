import { redirect } from "next/navigation";

// A raiz redireciona para a inbox (o middleware ja garante a sessao).
export default function Home() {
  redirect("/inbox");
}
