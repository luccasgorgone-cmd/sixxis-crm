// Gravacao da sincronizacao CRM x Loja (Fatias AA/AB). PONTO UNICO usado pela
// rota interna de aplicacao (Fatia AB). Aplica SOMENTE as chaves marcadas, tudo
// em transacao atomica e IDEMPOTENTE (rodar 2x nao duplica NF/rastreio/endereco).
// NAO toca em GANHO/valor/estoque/orcamento. Recebe a Analise ja recomputada no
// servidor (nunca confia em valores vindos de fora — so nas chaves).
import { prisma } from "./prisma";
import { recalcularNomeBusca } from "./nomeBusca";
import { registrarAtividade } from "./atividade";
import { getIO } from "./socket";
import { AtividadeTipo } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { soDigitos, type Analise } from "./sincronizarLoja";
import { dataSomenteDia } from "./data";

const CADASTRO_LEAD: Record<string, "nomeManual" | "cpf" | "email" | "empresa"> =
  {
    nome: "nomeManual",
    cpf: "cpf",
    email: "email",
    empresa: "empresa",
  };

type CampoEnd =
  | "cep"
  | "logradouro"
  | "numero"
  | "complemento"
  | "bairro"
  | "cidade"
  | "uf";

export type ResultadoAplicacao = {
  aplicados: string[];
  pulados: { chave: string; motivo: string }[];
  avisos: string[];
};

export async function aplicarSincronizacao(params: {
  leadId: string;
  analise: Analise;
  pedidas: Set<string>;
  negocio: { id: string | null; ambiguo: boolean };
  // Nome efetivo atual (para o evento realtime quando o nome nao muda).
  nomeEfetivoAtual: string;
  // Autor do registro: agenteId (null quando a origem e a Loja) + rotulo humano.
  autor: { agenteId: string | null; rotulo: string };
}): Promise<ResultadoAplicacao> {
  const { leadId, analise, pedidas, negocio, nomeEfetivoAtual, autor } = params;
  const porChave = new Map(analise.campos.map((c) => [c.chave, c]));

  const aplicados: string[] = [];
  const pulados: { chave: string; motivo: string }[] = [];
  const avisos: string[] = [];
  let nomeAplicado = false;

  await prisma.$transaction(async (tx) => {
    // --- Lead (cadastro): nome->nomeManual, cpf, email, empresa ---
    const leadData: Prisma.LeadUncheckedUpdateInput = {};
    for (const chave of Object.keys(CADASTRO_LEAD)) {
      if (!pedidas.has(chave)) continue;
      const campo = porChave.get(chave);
      if (!campo || campo.classificacao === "igual") continue;
      const valor = analise.valores[chave] ?? null;
      // CPF/CNPJ gravados canonicos (so digitos); a mascara e so de apresentacao.
      const canon =
        (chave === "cpf" || chave === "cnpj") && valor ? soDigitos(valor) : valor;
      (leadData as Record<string, unknown>)[CADASTRO_LEAD[chave]] = canon;
      if (chave === "nome") nomeAplicado = true;
      aplicados.push(chave);
    }
    if (Object.keys(leadData).length > 0) {
      await tx.lead.update({ where: { id: leadId }, data: leadData });
    }

    // --- Endereco: atualiza o principal; cria (principal) se nao houver ---
    const endData: Partial<Record<CampoEnd, string | null>> = {};
    for (const campo of analise.campos) {
      if (campo.grupo !== "endereco") continue;
      if (!pedidas.has(campo.chave) || campo.classificacao === "igual") continue;
      const val = analise.valores[campo.chave] ?? null;
      // CEP gravado canonico (so digitos); mascara e so de apresentacao.
      endData[campo.chave as CampoEnd] =
        campo.chave === "cep" && val ? soDigitos(val) : val;
      aplicados.push(campo.chave);
    }
    if (Object.keys(endData).length > 0) {
      const principal = await tx.endereco.findFirst({
        where: { leadId, principal: true },
        select: { id: true },
      });
      if (principal) {
        await tx.endereco.update({ where: { id: principal.id }, data: endData });
      } else {
        await tx.endereco.create({
          data: { leadId, principal: true, ...endData },
        });
      }
    }

    // --- Nota fiscal (aditiva; exige data; idempotente pelo numero) ---
    if (pedidas.has("notaFiscal")) {
      const numero = analise.valores.notaFiscal;
      // Data ancorada ao meio-dia UTC (nao desloca no fuso — relogio da garantia).
      const dataNFDia = dataSomenteDia(analise.dataNF);
      if (!numero) {
        pulados.push({ chave: "notaFiscal", motivo: "sem numero de NF" });
      } else {
        const existe = await tx.notaFiscal.findFirst({
          where: { leadId, numero },
          select: { id: true },
        });
        if (existe) {
          pulados.push({
            chave: "notaFiscal",
            motivo: "NF ja registrada para o cliente",
          });
        } else if (!dataNFDia) {
          pulados.push({ chave: "notaFiscal", motivo: "sem data da NF" });
        } else {
          await tx.notaFiscal.create({
            data: {
              leadId,
              negocioId: negocio.id,
              numero,
              dataNF: dataNFDia,
              agenteId: autor.agenteId,
            },
          });
          aplicados.push("notaFiscal");
          if (!negocio.id) {
            avisos.push(
              "Nota fiscal vinculada apenas ao cliente (negocio nao identificado).",
            );
          }
        }
      }
    }

    // --- Rastreio (exige negocio; idempotente pelo codigo) ---
    if (pedidas.has("codigoRastreio")) {
      const codigo = analise.valores.codigoRastreio;
      if (!codigo) {
        pulados.push({ chave: "codigoRastreio", motivo: "sem codigo de rastreio" });
      } else if (!negocio.id) {
        pulados.push({
          chave: "codigoRastreio",
          motivo: negocio.ambiguo
            ? "varios negocios abertos — informe o negocio certo"
            : "sem negocio para vincular",
        });
      } else {
        const existe = await tx.rastreioNegocio.findFirst({
          where: { negocioId: negocio.id, codigo },
          select: { id: true },
        });
        if (existe) {
          pulados.push({
            chave: "codigoRastreio",
            motivo: "rastreio ja registrado no negocio",
          });
        } else {
          await tx.rastreioNegocio.create({
            data: {
              negocioId: negocio.id,
              codigo,
              transportadora: analise.transportadora,
            },
          });
          aplicados.push("codigoRastreio");
        }
      }
    }
  });

  // Nome mudou -> recalcula nomeBusca (Fatia P, ponto unico). Best-effort.
  if (nomeAplicado) await recalcularNomeBusca(leadId);

  if (aplicados.length > 0) {
    await registrarAtividade({
      leadId,
      agenteId: autor.agenteId,
      tipo: AtividadeTipo.ACOMPANHAMENTO,
      descricao: `Dados sincronizados da loja: ${aplicados.join(", ")} (${autor.rotulo})`,
    });
    const novoNome = nomeAplicado
      ? (analise.valores.nome ?? nomeEfetivoAtual)
      : nomeEfetivoAtual;
    getIO()?.emit("cliente:atualizado", { leadId, nome: novoNome });
  }

  return { aplicados, pulados, avisos };
}
