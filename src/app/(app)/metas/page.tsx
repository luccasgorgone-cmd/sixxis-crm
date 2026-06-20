import { MinhasMetas } from "@/components/metas/MinhasMetas";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <MinhasMetas />
    </div>
  );
}
