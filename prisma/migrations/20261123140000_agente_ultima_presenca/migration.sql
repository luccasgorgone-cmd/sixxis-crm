-- Presenca viva do vendedor governa o rodizio de leads (corrige: "ausente nao
-- fica apos 15min" e "demora pra voltar a receber apos ficar online").
--
-- Coluna aditiva: timestamp do ultimo heartbeat/atividade do vendedor. A
-- varredura do servidor usa isto para derrubar quem fechou a aba / caiu a rede
-- (online "fantasma") e tirar do rodizio. NULL = nunca enviou heartbeat (conta
-- legada) -> a varredura NAO mexe nela (evita blackout de distribuicao no deploy).
-- Zero DROP, zero TEMP TABLE, sem DELETE.
ALTER TABLE "Agente" ADD COLUMN IF NOT EXISTS "ultimaPresencaEm" TIMESTAMP(3);
