// Contrato dourado C29 — interruptor mestre de mensagens automaticas.
//   npx tsx scripts/contratos/c29-mestre-mensagens-automaticas.ts
//
// Trava fail-closed: somente o booleano true autoriza o callback externo.
// Sem banco/rede: a leitura do mestre e o I/O externo sao fronteiras injetadas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  criarEnvioPeloCanalAutomatico,
  criarExecutorMensagemAutomatica,
  criarExecutorMensagemAutomaticaCondicional,
} from "../../src/lib/mensagemAutomatica";
import { criarLiberadorReservaRecaptacao } from "../../src/lib/recaptacaoReserva";

let ok = 0;
let falhou = 0;
async function caso(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhou++;
    console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  for (const [nome, valor] of [
    ["false", false],
    ["null", null],
    ["undefined", undefined],
  ] as const) {
    await caso(`mestre ${nome} bloqueia sem executar I/O`, async () => {
      let chamadas = 0;
      const executar = criarExecutorMensagemAutomatica(async () => valor);
      const resultado = await executar(async () => {
        chamadas++;
        return "NAO_PODE_SAIR";
      });
      assert.deepEqual(resultado, {
        executada: false,
        motivo: "MESTRE_DESLIGADO",
      });
      assert.equal(chamadas, 0);
    });
  }

  await caso("erro ao ler o mestre falha fechado", async () => {
    let chamadas = 0;
    const executar = criarExecutorMensagemAutomatica(async () => {
      throw new Error("banco indisponivel");
    });
    const resultado = await executar(async () => {
      chamadas++;
      return "NAO_PODE_SAIR";
    });
    assert.deepEqual(resultado, {
      executada: false,
      motivo: "ERRO_LEITURA_MESTRE",
    });
    assert.equal(chamadas, 0);
  });

  await caso("somente true executa uma vez e preserva o resultado", async () => {
    let chamadas = 0;
    const executar = criarExecutorMensagemAutomatica(async () => true);
    const resultado = await executar(async () => {
      chamadas++;
      return { ok: true, externalId: "literal-123" };
    });
    assert.deepEqual(resultado, {
      executada: true,
      resultado: { ok: true, externalId: "literal-123" },
    });
    assert.equal(chamadas, 1);
  });

  await caso("wrapper de canal OFF nao chama o adaptador externo", async () => {
    let chamadas = 0;
    const executar = criarExecutorMensagemAutomatica(async () => false);
    const enviar = criarEnvioPeloCanalAutomatico(
      executar,
      async () => {
        chamadas++;
        return { ok: true as const, externalId: "NAO_PODE_SAIR" };
      },
    );
    const resultado = await enviar(
      { id: "conta", provider: "EVOLUTION", finalidade: "POS_VENDA", refExterna: "pv" },
      { tipo: "TELEFONE", valor: "5511000000000", telefone: "5511000000000" },
      { tipo: "TEXTO", texto: "mensagem automatica" },
    );
    assert.deepEqual(resultado, {
      executada: false,
      motivo: "MESTRE_DESLIGADO",
    });
    assert.equal(chamadas, 0);
  });

  await caso("wrapper de canal ON preserva o resultado do adaptador", async () => {
    let chamadas = 0;
    const executar = criarExecutorMensagemAutomatica(async () => true);
    const enviar = criarEnvioPeloCanalAutomatico(
      executar,
      async () => {
        chamadas++;
        return { ok: true as const, externalId: "enviado-123" };
      },
    );
    const resultado = await enviar(
      { id: "conta", provider: "EVOLUTION", finalidade: "VENDA", refExterna: "venda" },
      { tipo: "TELEFONE", valor: "5511000000000", telefone: "5511000000000" },
      { tipo: "TEXTO", texto: "mensagem automatica" },
    );
    assert.deepEqual(resultado, {
      executada: true,
      resultado: { ok: true, externalId: "enviado-123" },
    });
    assert.equal(chamadas, 1);
  });

  await caso("OFF durante await da precondicao bloqueia o I/O final", async () => {
    let statusAtivo = true;
    let chamadas = 0;
    let liberarPrecondicao!: () => void;
    let avisarPrecondicao!: () => void;
    const precondicaoIniciada = new Promise<void>((resolve) => {
      avisarPrecondicao = resolve;
    });
    const barreira = new Promise<void>((resolve) => {
      liberarPrecondicao = resolve;
    });
    const executar = criarExecutorMensagemAutomatica(async () => true);
    const executarSe = criarExecutorMensagemAutomaticaCondicional(executar);

    const pendente = executarSe(
      async () => {
        avisarPrecondicao();
        await barreira;
        return statusAtivo;
      },
      async () => {
        chamadas++;
        return "NAO_PODE_SAIR";
      },
    );
    await precondicaoIniciada;
    statusAtivo = false;
    liberarPrecondicao();

    assert.deepEqual(await pendente, {
      executada: false,
      motivo: "PRECONDICAO_NEGADA",
    });
    assert.equal(chamadas, 0);
  });

  await caso("ordem final e mestre OFF impedem ate a leitura da precondicao", async () => {
    const ordem: string[] = [];
    const executar = criarExecutorMensagemAutomatica(async () => {
      ordem.push("mestre");
      return true;
    });
    const executarSe = criarExecutorMensagemAutomaticaCondicional(executar);
    const resultado = await executarSe(
      async () => {
        ordem.push("precondicao");
        return true;
      },
      async () => {
        ordem.push("io");
        return "ok";
      },
    );
    assert.deepEqual(resultado, { executada: true, resultado: "ok" });
    assert.deepEqual(ordem, ["mestre", "precondicao", "mestre", "io"]);

    let precondicoes = 0;
    const executarOff = criarExecutorMensagemAutomatica(async () => false);
    const executarSeOff = criarExecutorMensagemAutomaticaCondicional(executarOff);
    await executarSeOff(
      async () => {
        precondicoes++;
        return true;
      },
      async () => "NAO_PODE_SAIR",
    );
    assert.equal(precondicoes, 0);
  });

  await caso(
    "ON para OFF durante a precondicao bloqueia na segunda leitura",
    async () => {
      let leituras = 0;
      let chamadas = 0;
      const executar = criarExecutorMensagemAutomatica(async () => ++leituras === 1);
      const executarSe = criarExecutorMensagemAutomaticaCondicional(executar);
      const resultado = await executarSe(
        async () => true,
        async () => {
          chamadas++;
          return "NAO_PODE_SAIR";
        },
      );
      assert.deepEqual(resultado, {
        executada: false,
        motivo: "MESTRE_DESLIGADO",
      });
      assert.equal(leituras, 2);
      assert.equal(chamadas, 0);
    },
  );

  await caso("devolucao de cota faz um unico decremento atomico no mesmo dia", async () => {
    const chamadas: unknown[] = [];
    const liberar = criarLiberadorReservaRecaptacao(async (args) => {
      chamadas.push(args);
      return { count: 1 };
    });
    const hoje = new Date("2026-11-25T00:00:00.000Z");
    await liberar("campanha-1", hoje);
    assert.equal(chamadas.length, 1);
    assert.deepEqual(chamadas[0], {
      where: {
        id: "campanha-1",
        dataContadorDia: hoje,
        enviadosHoje: { gt: 0 },
      },
      data: { enviadosHoje: { decrement: 1 } },
    });
  });

  await caso("Sol protege IA, bolhas e handoff contra OFF concorrente", async () => {
    const src = readFileSync(join(process.cwd(), "src/lib/queue.ts"), "utf8");
    assert.match(
      src,
      /const geracaoAutomatica\s*=\s*await executarMensagemAutomatica\(\s*\(\)\s*=>\s*gerarRespostaLuna\(/s,
      "gerarRespostaLuna precisa ser executada pelo gate fresco do mestre",
    );
    assert.doesNotMatch(
      src,
      /const resultado\s*=\s*await gerarRespostaLuna\(/,
      "gerarRespostaLuna nao pode ficar fora do gate",
    );
    assert.match(
      src,
      /const mensagensPermitidas\s*=\s*await enviarMensagensLuna\([\s\S]*?if \(!mensagensPermitidas\) return;/,
      "OFF durante as bolhas precisa interromper tambem o handoff",
    );
    const inicioHandoff = src.indexOf("async function tratarHandoffLuna(");
    const fimHandoff = src.indexOf(
      "async function enviarMensagensLuna(",
      inicioHandoff,
    );
    const handoff = src.slice(inicioHandoff, fimHandoff);
    const preparacao = handoff.indexOf("const ultimaCliente =");
    const gate = handoff.indexOf("await executarMensagemAutomatica(");
    const primeiraMutacao = handoff.indexOf("await prisma.conversa.update(");
    assert.ok(
      preparacao >= 0 && gate > preparacao,
      "gate deve ocorrer depois da preparacao",
    );
    assert.ok(
      primeiraMutacao > gate,
      "primeira mutacao do handoff precisa ficar dentro do gate fresco",
    );
  });

  await caso(
    "campanha cancela e recaptura pausa devolvendo a cota reservada",
    async () => {
      const queue = readFileSync(join(process.cwd(), "src/lib/queue.ts"), "utf8");
      const recaptacao = readFileSync(
        join(process.cwd(), "src/lib/recaptacao.ts"),
        "utf8",
      );
      const reservaRecaptacao = readFileSync(
        join(process.cwd(), "src/lib/recaptacaoReserva.ts"),
        "utf8",
      );
      assert.match(
        queue,
        /where:\s*\{ id: campanhaId, status: StatusCampanha\.ENVIANDO \}[\s\S]*?data:\s*\{ status: StatusCampanha\.CANCELADA/s,
        "campanha bloqueada deve sair de ENVIANDO para CANCELADA",
      );
      assert.match(
        reservaRecaptacao,
        /data:\s*\{ enviadosHoje:\s*\{ decrement: 1 \} \}/,
        "reserva de cota precisa ser devolvida atomicamente",
      );
      assert.match(
        queue,
        /executarMensagemAutomaticaSe\([\s\S]*?StatusCampanha\.ENVIANDO[\s\S]*?enviarPeloCanal\(/,
        "campanha deve reler ENVIANDO depois do mestre e antes do I/O",
      );
      assert.match(
        recaptacao,
        /executarMensagemAutomaticaSe\([\s\S]*?StatusCampanhaRecap\.ARMADA[\s\S]*?enviarPeloCanal\(/,
        "recaptura deve reler ARMADA depois do mestre e antes do I/O",
      );
      const bloqueio = recaptacao.indexOf("if (!envioAutomatico.executada)");
      const devolucao = recaptacao.indexOf(
        "await devolverReservaRecaptacao",
        bloqueio,
      );
      const pausa = recaptacao.indexOf("await pausar(", bloqueio);
      assert.ok(
        bloqueio >= 0 && devolucao > bloqueio,
        "OFF apos jitter deve devolver a reserva",
      );
      assert.ok(
        pausa > devolucao,
        "a reserva deve ser devolvida antes de pausar a recaptura",
      );
    },
  );

  await caso("rotas humanas continuam fora do gate automatico", async () => {
    for (const arquivo of ["src/lib/queue.ts", "src/lib/recaptacao.ts"]) {
      const src = readFileSync(join(process.cwd(), arquivo), "utf8");
      assert.match(src, /from "\.\/mensagemAutomatica"/);
      assert.match(src, /executarMensagemAutomaticaSe\(/);
    }

    for (const arquivo of [
      "src/app/api/mensagens/enviar/route.ts",
      "src/app/api/mensagens/enviar-audio/route.ts",
      "src/app/api/mensagens/enviar-arquivo/route.ts",
      "src/app/api/mensagens/enviar-contato/route.ts",
      "src/app/api/mensagens/encaminhar/route.ts",
      "src/app/api/negocios/[id]/enviar-orcamento/route.ts",
      "src/app/api/negocios/[id]/enviar-cobranca/route.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), arquivo), "utf8");
      assert.match(
        src,
        /\benviarPeloCanal\s*\(/,
        `${arquivo} deve manter o envio humano direto`,
      );
      assert.doesNotMatch(
        src,
        /mensagemAutomatica/,
        `${arquivo} humano nao deve depender do mestre`,
      );
    }
  });

  console.log(`\nc29-mestre-mensagens-automaticas: ${ok} ok, ${falhou} falha(s)`);
  if (falhou > 0) process.exit(1);
}

void main();
