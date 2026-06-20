import { redirect } from "next/navigation";

// /admin entra na area de configuracao (primeiro item). O Painel da operacao
// fica no menu principal (/admin/dashboard).
export default function AdminHome() {
  redirect("/admin/colaboradores");
}
