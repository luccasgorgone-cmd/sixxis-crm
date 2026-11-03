// Decisao PURA do cadastro manual de cliente quando o telefone JA existe no
// sistema. Separada da rota (/api/leads) para ser testavel sem banco (contrato
// C17) e para a regra morar num lugar so.
//
// REGRA (pedido direto do Luccas): um numero que ja pertence a OUTRO vendedor
// NAQUELA finalidade NAO pode ser "assumido" por um vendedor comum — o cadastro
// e BLOQUEADO com aviso de quem e o dono, e so um admin reatribui (e uma
// transferencia de carteira, nao um cadastro). Quando o numero ainda nao tem
// dono na finalidade, ja e do proprio requester, ou quem cadastra e admin, nao
// ha roubo: pode assumir/vincular. Sem lead existente -> cria normal.
//
// A funcao NAO olha o banco: recebe os fatos ja apurados pela rota e so decide.

export type DecisaoCadastro =
  | { acao: "CRIAR" }
  | { acao: "ASSUMIR"; bloqueado: boolean };

export function decidirCadastroDuplicado(p: {
  // Ja existe um lead casando com o telefone (em qualquer variante)?
  existe: boolean;
  // Dono do lead existente NA finalidade pedida (donoId p/ venda,
  // donoPosVendaId p/ pos-venda). null = sem dono naquela finalidade.
  donoFinalidade: string | null;
  // Agente que esta cadastrando (sempre o id real do usuario, mesmo quando admin
  // escolhe um colaborador como dono — o "roubo" se mede contra o usuario).
  requesterId: string;
  ehAdmin: boolean;
}): DecisaoCadastro {
  if (!p.existe) return { acao: "CRIAR" };

  // Pertence a outro: tem dono definido na finalidade e nao e o proprio usuario.
  const outroDono =
    p.donoFinalidade != null && p.donoFinalidade !== p.requesterId;

  // So bloqueia o vendedor comum. Admin pode reatribuir (transferencia).
  const bloqueado = outroDono && !p.ehAdmin;

  return { acao: "ASSUMIR", bloqueado };
}
