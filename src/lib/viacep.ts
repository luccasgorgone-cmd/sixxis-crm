// Consulta o ViaCEP (API publica) por CEP e devolve os campos de endereco, ou
// null quando o CEP tem menos de 8 digitos, nao existe, ou a rede falha. Helper
// compartilhado entre o cadastro (ModalCadastrarCliente) e a edicao de enderecos
// (Enderecos), para nao duplicar a logica do fetch.
export type ViaCepResultado = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export async function buscarViaCep(
  cepBruto: string,
): Promise<ViaCepResultado | null> {
  const digitos = cepBruto.replace(/\D/g, "");
  if (digitos.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
    const j = await r.json();
    if (j.erro) return null;
    return {
      logradouro: j.logradouro ?? "",
      bairro: j.bairro ?? "",
      cidade: j.localidade ?? "",
      uf: j.uf ?? "",
    };
  } catch {
    return null;
  }
}
