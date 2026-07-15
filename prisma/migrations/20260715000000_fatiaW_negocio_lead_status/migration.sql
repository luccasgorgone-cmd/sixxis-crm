-- Fatia W: roteamento da mensagem ENTRANTE pelo setor com atendimento ABERTO.
-- ADITIVO, sem DROP: indice para resolver rapidamente, por lead, quais setores
-- tem Negocio.status = ABERTO. A resolucao roda em toda mensagem de entrada.

CREATE INDEX "Negocio_leadId_status_idx" ON "Negocio"("leadId", "status");
