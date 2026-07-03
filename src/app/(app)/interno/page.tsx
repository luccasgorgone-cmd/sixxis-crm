// Secao "Sixxis" (comunicacao interna): chat dos grupos de WhatsApp que os
// numeros da empresa participam. ISOLADO do Inbox/Kanban/metricas.
import { ChatInterno } from "@/components/interno/ChatInterno";

export const dynamic = "force-dynamic";

export default function InternoPage() {
  return <ChatInterno />;
}
