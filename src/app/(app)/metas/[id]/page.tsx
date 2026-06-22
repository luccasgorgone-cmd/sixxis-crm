import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DetalheMeta } from "@/components/metas/DetalheMeta";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <DetalheMeta
        id={id}
        papel={session.user.papel}
        agenteIdAtual={session.user.id}
      />
    </div>
  );
}
