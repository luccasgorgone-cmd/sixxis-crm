// Erros no formato RFC 9457 (application/problem+json). Pure (sem runtime web):
// o builder de Response fica em resposta.ts. Aqui so a classe + fabricas.

export interface ProblemaJson {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  // Extensoes (RFC 9457 permite campos adicionais).
  requestId?: string;
  errors?: unknown;
  [extra: string]: unknown;
}

const BASE_TYPE = "https://sixxis-crm/errors/";

export class ProblemaApi extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail?: string;
  readonly extras: Record<string, unknown>;
  // Headers extras que a resposta deve carregar (ex.: Retry-After, Allow).
  readonly headers: Record<string, string>;

  constructor(opts: {
    status: number;
    type: string;
    title: string;
    detail?: string;
    extras?: Record<string, unknown>;
    headers?: Record<string, string>;
  }) {
    super(opts.detail ?? opts.title);
    this.name = "ProblemaApi";
    this.status = opts.status;
    this.type = BASE_TYPE + opts.type;
    this.title = opts.title;
    this.detail = opts.detail;
    this.extras = opts.extras ?? {};
    this.headers = opts.headers ?? {};
  }

  paraJson(requestId: string, instance?: string): ProblemaJson {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(instance ? { instance } : {}),
      requestId,
      ...this.extras,
    };
  }
}

export function naoAutenticado(detail?: string): ProblemaApi {
  return new ProblemaApi({
    status: 401,
    type: "nao-autenticado",
    title: "Nao autenticado",
    detail: detail ?? "Credencial Bearer ausente, invalida, revogada ou expirada.",
    headers: { "WWW-Authenticate": 'Bearer realm="api-v1"' },
  });
}

export function proibido(detail?: string): ProblemaApi {
  return new ProblemaApi({
    status: 403,
    type: "escopo-insuficiente",
    title: "Escopo insuficiente",
    detail: detail ?? "A chave nao possui o escopo necessario para este recurso.",
  });
}

export function naoEncontrado(detail?: string): ProblemaApi {
  return new ProblemaApi({
    status: 404,
    type: "nao-encontrado",
    title: "Recurso nao encontrado",
    detail,
  });
}

export function requisicaoInvalida(detail?: string, errors?: unknown): ProblemaApi {
  return new ProblemaApi({
    status: 400,
    type: "requisicao-invalida",
    title: "Requisicao invalida",
    detail,
    extras: errors !== undefined ? { errors } : {},
  });
}

export function metodoNaoPermitido(allow: string[]): ProblemaApi {
  return new ProblemaApi({
    status: 405,
    type: "metodo-nao-permitido",
    title: "Metodo nao permitido",
    detail: "A API de Leitura v1 e read-only: apenas GET/HEAD/OPTIONS.",
    headers: { Allow: allow.join(", ") },
  });
}

export function limiteExcedido(retryAfterSeg: number): ProblemaApi {
  return new ProblemaApi({
    status: 429,
    type: "limite-excedido",
    title: "Limite de requisicoes excedido",
    detail: "Rate limit de 600 req/min por chave atingido.",
    headers: { "Retry-After": String(retryAfterSeg) },
  });
}

export function tempoEsgotado(detail?: string): ProblemaApi {
  return new ProblemaApi({
    status: 504,
    type: "tempo-esgotado",
    title: "Tempo de consulta esgotado",
    detail: detail ?? "A consulta excedeu o tempo maximo permitido.",
  });
}

export function erroInterno(detail?: string): ProblemaApi {
  return new ProblemaApi({
    status: 500,
    type: "erro-interno",
    title: "Erro interno",
    detail,
  });
}
