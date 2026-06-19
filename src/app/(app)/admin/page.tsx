import { redirect } from "next/navigation";

// /admin cai no painel da operacao.
export default function AdminHome() {
  redirect("/admin/dashboard");
}
