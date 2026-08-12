-- Fatia 7 (Bloco 1) — VALOR ESTRUTURADO no evento de ganho.
-- ADITIVO: uma coluna nova, nullable. Nenhum DROP, nenhuma descricao alterada,
-- nenhuma linha removida. O texto da descricao continua exatamente como esta —
-- esta coluna e COMPLEMENTO, para somar o historico de compras por NUMERO em vez
-- de por parsing de texto.

ALTER TABLE "HistoricoNegocio" ADD COLUMN IF NOT EXISTS "valorGanho" DECIMAL(12,2);

-- BACKFILL dos ganhos ANTIGOS (caminho (a): extrair do texto).
-- Seguro porque o formato e UNICO e estavel desde que o evento existe: a
-- descricao sempre nasce de `Negocio ganho (${brl(valor)})...`, com brl() =
-- toLocaleString('pt-BR', currency BRL). Nunca houve outro formato no codigo.
--
-- O padrao e ANCORADO no prefixo "Negocio ganho (" e captura so o numero em
-- pt-BR (milhar com ponto, decimal com virgula, sempre 2 casas). O trecho entre
-- "R$" e o numero e casado como [^0-9]* de proposito: dependendo da versao do
-- ICU o separador ali e espaco comum ou espaco NAO-QUEBRAVEL (U+00A0), e assim
-- os dois casam.
--
-- NAO INVENTA VALOR: a linha so e atualizada quando o padrao casa. O que nao
-- casar fica NULL e a UI mostra "valor nao registrado" naquela compra, sem
-- entrar na soma. Nenhum evento que ja tenha valorGanho e reescrito, entao
-- rodar de novo nao muda nada (idempotente).

UPDATE "HistoricoNegocio" h
   SET "valorGanho" = CAST(
         replace(
           replace(
             substring(h."descricao" from 'Negocio ganho \([^0-9]*([0-9.]+,[0-9]{2})\)'),
             '.', ''),
           ',', '.')
         AS DECIMAL(12,2))
 WHERE h."tipo" = 'GANHO'
   AND h."valorGanho" IS NULL
   AND substring(h."descricao" from 'Negocio ganho \([^0-9]*([0-9.]+,[0-9]{2})\)') IS NOT NULL;
