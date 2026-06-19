import { redirect } from "next/navigation";

// /admin cai na primeira secao.
export default function AdminHome() {
  redirect("/admin/vendedores");
}
