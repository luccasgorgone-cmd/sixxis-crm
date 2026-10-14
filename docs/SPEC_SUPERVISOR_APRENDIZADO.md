# SPEC — Aprendizado do Supervisor Comercial IA

**Status:** IMPLEMENTADO (A1+A2+A3) na branch de trabalho — Luccas autorizou
direto "pode seguir sim, siga com suas recomendações". Gates verdes por fase;
nada em produção (deploy = catraca). Doc em disco por Artigo 14.
**Data:** 2026-10-14.
**Classificação:** Architectural (loop de feedback + store de aprendizado + job
agendado + injeção no contexto da IA).
**Branch:** `wip/atendimento-omnichannel-provider-abstract` (não-deploy). Deploy só
com OK direto (catraca).

---

## 1. O que "aprender" significa aqui (reframe honesto)

A IA **não se re-treina** — não dá para fine-tunar o modelo (Gemini via API) de
forma barata/segura nesta infra, e deixar um LLM reescrever as próprias instruções
é exatamente o que as travas do Supervisor evitam. O que é **real, verificável e
valioso** é um **loop de feedback determinístico**:

> a IA acumula o que deu certo e o que o gestor aceitou/descartou, destila isso em
> **insights** da operação, e realimenta esses insights nas próprias decisões —
> melhorando o conselho e a priorização ao longo do tempo.

Isso é aprendizado genuíno (a saída muda conforme a experiência acumulada), custo
de token **zero** (estatística determinística), e sem risco para as travas.

## 2. De onde ela aprende (sinais já existentes)

- **Veredito do gestor (ledger):** cada proposta já vira `SupervisorAcao` com
  status EXECUTADO/DESCARTADO/REVERTIDO. É o feedback bruto — "o gestor valoriza
  este tipo de sugestão?".
- **Resultado do negócio:** para uma ação EXECUTADA num negócio, o negócio depois
  chegou a GANHO (acerto) ou PERDIDO (não ajudou)? Deriva taxa de sucesso.
- **Padrões de produção:** correlações nos negócios fechados (velocidade de 1ª
  resposta × conversão, etapas que travam, origem que converte) — as mesmas
  análises determinísticas que o painel já sabe fazer.

## 3. O que ela aprende (snapshot de aprendizado)

Um snapshot determinístico recomputado periodicamente, guardado em
`SupervisorConfig.aprendizadoJson`:

- **aceitacaoPorSinal / aceitacaoPorFerramenta:** EXECUTADO ÷ (EXECUTADO+DESCARTADO)
  por tipo de sinal da varredura e por ferramenta. Baixa aceitação = o gestor não
  valoriza aquele tipo → despriorizar + sugerir desligar (nunca desliga sozinho).
- **sucessoPorSinal:** dos negócios com ação EXECUTADA, % que virou GANHO depois.
- **insights:** frases curtas das correlações mais fortes ("responder em <5min
  converte Nx", "etapa X trava e vira perda", "origem Y converte melhor"), geradas
  por regra a partir dos números reais — nunca inventadas pelo modelo.
- **geradoEm, amostras:** quando estudou e sobre quantos casos (honestidade: amostra
  pequena é sinalizada, não escondida).
- **historico:** últimos N snapshots-resumo (para mostrar que está melhorando).

## 4. Como o aprendizado muda o comportamento

- **Chat:** o snapshot entra no system prompt ("PADRÕES APRENDIDOS DESTA OPERAÇÃO,
  atualizado em …") — o conselho passa a refletir a realidade do negócio e melhora
  a cada estudo.
- **Explicativo:** nova seção "O que a IA aprendeu" — aceitação por sinal, insights,
  última vez que estudou, tamanho da amostra.
- **Varredura:** ordena as propostas pelos sinais de maior aceitação primeiro; e
  quando um sinal é descartado acima de um corte (ex.: 80%), **sugere** desligá-lo
  (card/insight) — NUNCA desliga sozinho (config é human-in-the-loop, já é assim).

## 5. Quando ela aprende (agendamento — responde à sua pergunta)

- **Em tempo real (grátis):** o ledger já atualiza a cada confirmar/descartar. Nada
  a construir — o veredito do gestor entra na hora.
- **Estudo (recomputar insights): agendado.** Recomendação: **não** a cada passada
  (minar histórico toda hora é ruído e desperdício); rodar algumas vezes ao dia.
  Default `cadenciaHoras = 12` (~2×/dia), configurável. Reusa o ticker de 60s que a
  varredura já usa (checa "está na hora de estudar?"). Roda **mesmo com a varredura
  desligada** (aprende do chat + do histórico também). Além disso: botão **"estudar
  agora"** para o gestor forçar na hora.

Mapeando suas opções: *tempo real* = ledger; *horário(s) do dia* = estudo agendado;
*na hora* = botão manual. Cobre as três sem gastar à toa.

## 6. Travas (o aprendizado não enfraquece nada)

- Determinístico, zero token → sem risco de orçamento.
- **Nunca** toca as linhas vermelhas (não fala com cliente) nem reescreve
  guardrails. Ajusta insights/prioridade, não segurança.
- **Nunca** auto-edita config nem auto-desliga sinal — só **sugere**; mudar config
  segue human-in-the-loop (o que já construímos).
- Insights vêm sempre de números reais; amostra pequena é marcada como fraca.

## 7. Dados (aditivo — zero DROP/TEMP)

- `SupervisorConfig.aprendizadoJson Json?` (nova coluna, nullable, aditiva).
- Sem tabela nova: o ledger já é `SupervisorAcao`; o snapshot mora no JSON.

## 8. Fases

- **A1 — Loop + estudo:** schema `aprendizadoJson` + tipos (AprendizadoSnapshot +
  resolver) + `estudarAprendizado()` (determinístico: lê SupervisorAcao + negócios
  fechados, computa aceitação/sucesso/insights) + salvar snapshot + estudo agendado
  no ticker + rota `POST /api/admin/supervisor/aprender` (estudar agora) + testes de
  contrato (classificação de sinal, matemática de aceitação).
- **A2 — Uso + visibilidade:** injeta o snapshot no system prompt do chat + seção
  "O que a IA aprendeu" no Explicativo.
- **A3 — Priorização:** varredura ordena por aceitação e sugere desligar sinal com
  rejeição alta (nunca desliga sozinho).

## 9. Testes

- Puros (c7): classificar sinal a partir do motivo, taxa de aceitação, resolver
  snapshot parcial, insight só quando a amostra é suficiente.
- Banco real (docker descartável): estudar sobre ledger semeado → snapshot correto;
  botão "estudar agora" idempotente.
- Gates por commit: tsc 0, next build 0, contratos c1..c7, smokes docker.

## 10. Fora de escopo

- Fine-tuning / treino de modelo.
- A IA auto-editar guardrails ou config sem confirmação.
- Qualquer envio a cliente.
