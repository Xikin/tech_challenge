export const SERVICO_OS = 'oficina-os';

export const COMANDOS = {
  ABRIR_DIAGNOSTICO: 'execucao.comando.abrir-diagnostico',
  LIBERAR_EXECUCAO: 'execucao.comando.liberar-execucao',
  CANCELAR_EXECUCAO: 'execucao.comando.cancelar',
  GERAR_ORCAMENTO: 'billing.comando.gerar-orcamento',
  CANCELAR_BILLING: 'billing.comando.cancelar',
} as const;

export const EVENTOS = {
  DIAGNOSTICO_INICIADO: 'execucao.evento.diagnostico-iniciado',
  DIAGNOSTICO_CONCLUIDO: 'execucao.evento.diagnostico-concluido',
  EXECUCAO_INICIADA: 'execucao.evento.execucao-iniciada',
  EXECUCAO_FINALIZADA: 'execucao.evento.execucao-finalizada',
  EXECUCAO_FALHOU: 'execucao.evento.execucao-falhou',
  EXECUCAO_CANCELADA: 'execucao.evento.cancelada',
  ORCAMENTO_GERADO: 'billing.evento.orcamento-gerado',
  ORCAMENTO_FALHOU: 'billing.evento.orcamento-falhou',
  ORCAMENTO_APROVADO: 'billing.evento.orcamento-aprovado',
  ORCAMENTO_REPROVADO: 'billing.evento.orcamento-reprovado',
  PAGAMENTO_CONFIRMADO: 'billing.evento.pagamento-confirmado',
  PAGAMENTO_RECUSADO: 'billing.evento.pagamento-recusado',
  BILLING_CANCELADO: 'billing.evento.cancelado',
} as const;

export type TipoComando = (typeof COMANDOS)[keyof typeof COMANDOS];
export type TipoEvento = (typeof EVENTOS)[keyof typeof EVENTOS];

export interface Mensagem<T = Record<string, unknown>> {
  id: string;
  tipo: string;
  versao: 1;
  sagaId: string;
  ordemId: string;
  causadaPor: string | null;
  origem: string;
  ocorridaEm: string;
  dados: T;
}

export interface MensagemSaida {
  mensagem: Mensagem;
  cabecalhos: Record<string, string>;
}

export class MensagemInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'MensagemInvalidaError';
  }
}

export class EventoPrematuroError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'EventoPrematuroError';
  }
}
