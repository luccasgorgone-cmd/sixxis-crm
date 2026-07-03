// Aba de Chamadas: historico das chamadas de WhatsApp recebidas (recebidas x
// perdidas), com escopo por usuario. O CRM registra/organiza; nao atende audio.
import { Chamadas } from "@/components/chamadas/Chamadas";

export const dynamic = "force-dynamic";

export default function ChamadasPage() {
  return <Chamadas />;
}
