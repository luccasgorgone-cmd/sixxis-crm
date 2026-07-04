// Helpers da aba LOCAL (assistencia). Monta o snapshot de cliente/endereco do
// ItemLocal a partir do corpo da requisicao, completando o que faltar com os
// dados do lead vinculado (contato + endereco principal). Reusado no POST/PUT.
import { prisma } from "@/lib/prisma";
import { nomeEfetivo, selectClienteBasico } from "@/lib/cliente";

export type DadosClienteLocal = {
  clienteNome: string | null;
  clienteTelefone: string | null;
  clienteEmail: string | null;
  clienteCpf: string | null;
  enderecoCep: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
};

// Normaliza um valor textual do corpo em string aparada ou null.
export function texto(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

// Prioriza o que veio no corpo (edicao manual); completa o que faltar com o lead.
export async function montarDadosCliente(
  body: Record<string, unknown>,
  leadId: string | null,
): Promise<DadosClienteLocal> {
  let auto: Record<string, string | null> = {};
  if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        ...selectClienteBasico,
        email: true,
        cpf: true,
        enderecos: {
          orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
          take: 1,
          select: {
            cep: true,
            logradouro: true,
            numero: true,
            complemento: true,
            bairro: true,
            cidade: true,
            uf: true,
          },
        },
      },
    });
    if (lead) {
      const e = lead.enderecos[0];
      auto = {
        clienteNome: nomeEfetivo(lead),
        clienteTelefone: lead.telefone,
        clienteEmail: lead.email ?? null,
        clienteCpf: lead.cpf ?? null,
        enderecoCep: e?.cep ?? null,
        enderecoLogradouro: e?.logradouro ?? null,
        enderecoNumero: e?.numero ?? null,
        enderecoComplemento: e?.complemento ?? null,
        enderecoBairro: e?.bairro ?? null,
        enderecoCidade: e?.cidade ?? null,
        enderecoUf: e?.uf ?? null,
      };
    }
  }
  const campo = (chave: keyof DadosClienteLocal): string | null =>
    body[chave] !== undefined ? texto(body[chave]) : (auto[chave] ?? null);
  return {
    clienteNome: campo("clienteNome"),
    clienteTelefone: campo("clienteTelefone"),
    clienteEmail: campo("clienteEmail"),
    clienteCpf: campo("clienteCpf"),
    enderecoCep: campo("enderecoCep"),
    enderecoLogradouro: campo("enderecoLogradouro"),
    enderecoNumero: campo("enderecoNumero"),
    enderecoComplemento: campo("enderecoComplemento"),
    enderecoBairro: campo("enderecoBairro"),
    enderecoCidade: campo("enderecoCidade"),
    enderecoUf: campo("enderecoUf"),
  };
}
