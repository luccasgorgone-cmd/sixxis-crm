-- Fatia Z: status "LIDA" (dois checks azuis) nas mensagens enviadas.
-- ADITIVO: novo valor no enum StatusEnvio. Postgres exige ADD VALUE fora de uma
-- transacao que o USE no mesmo bloco; aqui so adicionamos o valor (nao usamos),
-- entao roda sem atrito. O ack READ/PLAYED do WhatsApp passa a virar LIDA no
-- codigo (antes era achatado em ENTREGUE).

ALTER TYPE "StatusEnvio" ADD VALUE IF NOT EXISTS 'LIDA';
