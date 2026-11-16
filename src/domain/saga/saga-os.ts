import type { StatusOS } from '../enums/status-os.enum';
import { COMANDOS, EVENTOS, type TipoComando } from '../mensageria/mensagem';

export type EtapaSaga =
  'DIAGNOSTICO' | 'ORCAMENTO' | 'APROVACAO' | 'PAGAMENTO' | 'EXECUCAO' | 'CONCLUIDA';

export type StatusSaga = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'COMPENSANDO' | 'COMPENSADA';

export type Participante = 'execucao' | 'billing';

export interface EstadoSaga {
  etapa: EtapaSaga;
  status: StatusSaga;
  participantes: Participante[];
  compensacoesPendentes: Participante[];
  motivoFalha: string | null;
}

export interface ItemOrcado {
  tipo: 'SERVICO' | 'PECA';
  referenciaId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
}

export const CANCELAMENTO_SOLICITADO = 'os.cancelamento-solicitado';

export type EventoSaga =
  | { tipo: typeof EVENTOS.DIAGNOSTICO_INICIADO }
  | {
      tipo: typeof EVENTOS.DIAGNOSTICO_CONCLUIDO;
      itens: ItemOrcado[];
      observacao?: string;
    }
  | { tipo: typeof EVENTOS.ORCAMENTO_GERADO; orcamentoId: string; valorTotal: number }
  | { tipo: typeof EVENTOS.ORCAMENTO_FALHOU; motivo: string }
  | { tipo: typeof EVENTOS.ORCAMENTO_APROVADO; orcamentoId: string; linkPagamento: string }
  | { tipo: typeof EVENTOS.ORCAMENTO_REPROVADO; orcamentoId: string; motivo?: string }
  | { tipo: typeof EVENTOS.PAGAMENTO_CONFIRMADO; pagamentoId: string; valor: number }
  | { tipo: typeof EVENTOS.PAGAMENTO_RECUSADO; motivo: string }
  | { tipo: typeof EVENTOS.EXECUCAO_INICIADA }
  | { tipo: typeof EVENTOS.EXECUCAO_FINALIZADA; tempoRealMin?: number }
  | { tipo: typeof EVENTOS.EXECUCAO_FALHOU; motivo: string }
  | { tipo: typeof EVENTOS.EXECUCAO_CANCELADA }
  | { tipo: typeof EVENTOS.BILLING_CANCELADO; estornado: boolean }
  | { tipo: typeof CANCELAMENTO_SOLICITADO; motivo: string };

export interface EfeitosNaOrdem {
  itens?: ItemOrcado[];
  orcamentoId?: string;
  valorTotal?: number;
  linkPagamento?: string;
  pago?: boolean;
}

export interface Decisao {
  aceita: boolean;
  prematura: boolean;
  estado: EstadoSaga;
  statusOS: StatusOS | null;
  comandos: TipoComando[];
  efeitos: EfeitosNaOrdem;
  observacao: string;
}

export function valorDosItens(itens: ItemOrcado[]): number {
  const centavos = itens.reduce(
    (total, item) => total + Math.round(item.precoUnitario * 100) * item.quantidade,
    0,
  );
  return centavos / 100;
}

const COMANDO_DE_CANCELAMENTO: Record<Participante, TipoComando> = {
  execucao: COMANDOS.CANCELAR_EXECUCAO,
  billing: COMANDOS.CANCELAR_BILLING,
};

export function iniciarSaga(): Decisao {
  return {
    aceita: true,
    prematura: false,
    estado: {
      etapa: 'DIAGNOSTICO',
      status: 'EM_ANDAMENTO',
      participantes: ['execucao'],
      compensacoesPendentes: [],
      motivoFalha: null,
    },
    statusOS: 'RECEBIDA',
    comandos: [COMANDOS.ABRIR_DIAGNOSTICO],
    efeitos: {},
    observacao: 'OS aberta e enviada para a fila de diagnóstico',
  };
}

const ORDEM_DAS_ETAPAS: EtapaSaga[] = [
  'DIAGNOSTICO',
  'ORCAMENTO',
  'APROVACAO',
  'PAGAMENTO',
  'EXECUCAO',
  'CONCLUIDA',
];

const ETAPA_DO_EVENTO: Partial<Record<EventoSaga['tipo'], EtapaSaga>> = {
  [EVENTOS.DIAGNOSTICO_INICIADO]: 'DIAGNOSTICO',
  [EVENTOS.DIAGNOSTICO_CONCLUIDO]: 'DIAGNOSTICO',
  [EVENTOS.ORCAMENTO_GERADO]: 'ORCAMENTO',
  [EVENTOS.ORCAMENTO_FALHOU]: 'ORCAMENTO',
  [EVENTOS.ORCAMENTO_APROVADO]: 'APROVACAO',
  [EVENTOS.ORCAMENTO_REPROVADO]: 'APROVACAO',
  [EVENTOS.PAGAMENTO_CONFIRMADO]: 'PAGAMENTO',
  [EVENTOS.PAGAMENTO_RECUSADO]: 'PAGAMENTO',
  [EVENTOS.EXECUCAO_INICIADA]: 'EXECUCAO',
  [EVENTOS.EXECUCAO_FINALIZADA]: 'EXECUCAO',
  [EVENTOS.EXECUCAO_FALHOU]: 'EXECUCAO',
};

function ignorar(estado: EstadoSaga, motivo: string, prematura = false): Decisao {
  return {
    aceita: false,
    prematura,
    estado,
    statusOS: null,
    comandos: [],
    efeitos: {},
    observacao: motivo,
  };
}

function foraDeOrdem(estado: EstadoSaga, evento: EventoSaga): Decisao {
  const esperada = ETAPA_DO_EVENTO[evento.tipo];
  if (esperada && ORDEM_DAS_ETAPAS.indexOf(esperada) > ORDEM_DAS_ETAPAS.indexOf(estado.etapa))
    return ignorar(
      estado,
      `Evento ${evento.tipo} chegou antes de a etapa ${estado.etapa} terminar`,
      true,
    );
  return ignorar(estado, `Evento ${evento.tipo} fora de ordem na etapa ${estado.etapa}`);
}

function avancar(
  estado: EstadoSaga,
  mudancas: Partial<EstadoSaga>,
  statusOS: StatusOS | null,
  observacao: string,
  comandos: TipoComando[] = [],
  efeitos: EfeitosNaOrdem = {},
): Decisao {
  return {
    aceita: true,
    prematura: false,
    estado: { ...estado, ...mudancas },
    statusOS,
    comandos,
    efeitos,
    observacao,
  };
}

function compensar(estado: EstadoSaga, motivo: string): Decisao {
  const pendentes = [...estado.participantes];
  return {
    aceita: true,
    prematura: false,
    estado: {
      ...estado,
      status: 'COMPENSANDO',
      compensacoesPendentes: pendentes,
      motivoFalha: motivo,
    },
    statusOS: null,
    comandos: pendentes.map((p) => COMANDO_DE_CANCELAMENTO[p]),
    efeitos: {},
    observacao: `Compensação iniciada: ${motivo}`,
  };
}

function confirmarCompensacao(estado: EstadoSaga, participante: Participante): Decisao {
  if (!estado.compensacoesPendentes.includes(participante))
    return ignorar(estado, `Compensação de ${participante} já confirmada`);

  const restantes = estado.compensacoesPendentes.filter((p) => p !== participante);
  if (restantes.length > 0)
    return avancar(
      estado,
      { compensacoesPendentes: restantes },
      null,
      `Compensação de ${participante} confirmada`,
    );

  return avancar(
    estado,
    { compensacoesPendentes: [], status: 'COMPENSADA' },
    'CANCELADA',
    `OS cancelada: ${estado.motivoFalha ?? 'compensação concluída'}`,
  );
}

function decidirCompensando(estado: EstadoSaga, evento: EventoSaga): Decisao {
  if (evento.tipo === EVENTOS.EXECUCAO_CANCELADA) return confirmarCompensacao(estado, 'execucao');
  if (evento.tipo === EVENTOS.BILLING_CANCELADO) return confirmarCompensacao(estado, 'billing');
  return ignorar(estado, `Evento ${evento.tipo} ignorado: saga em compensação`);
}

function decidirEmAndamento(estado: EstadoSaga, evento: EventoSaga): Decisao {
  if (evento.tipo === CANCELAMENTO_SOLICITADO) return compensar(estado, evento.motivo);

  switch (estado.etapa) {
    case 'DIAGNOSTICO':
      if (evento.tipo === EVENTOS.DIAGNOSTICO_INICIADO)
        return avancar(estado, {}, 'EM_DIAGNOSTICO', 'Mecânico iniciou o diagnóstico');
      if (evento.tipo === EVENTOS.DIAGNOSTICO_CONCLUIDO)
        return avancar(
          estado,
          { etapa: 'ORCAMENTO', participantes: [...estado.participantes, 'billing'] },
          'EM_DIAGNOSTICO',
          evento.observacao ?? 'Diagnóstico concluído; orçamento solicitado',
          [COMANDOS.GERAR_ORCAMENTO],
          { itens: evento.itens, valorTotal: valorDosItens(evento.itens) },
        );
      break;

    case 'ORCAMENTO':
      if (evento.tipo === EVENTOS.ORCAMENTO_GERADO)
        return avancar(
          estado,
          { etapa: 'APROVACAO' },
          'AGUARDANDO_APROVACAO',
          'Orçamento enviado para aprovação do cliente',
          [],
          { orcamentoId: evento.orcamentoId, valorTotal: evento.valorTotal },
        );
      if (evento.tipo === EVENTOS.ORCAMENTO_FALHOU)
        return compensar(estado, `Falha ao gerar orçamento: ${evento.motivo}`);
      break;

    case 'APROVACAO':
      if (evento.tipo === EVENTOS.ORCAMENTO_APROVADO)
        return avancar(
          estado,
          { etapa: 'PAGAMENTO' },
          'AGUARDANDO_PAGAMENTO',
          'Orçamento aprovado; aguardando pagamento',
          [],
          { linkPagamento: evento.linkPagamento },
        );
      if (evento.tipo === EVENTOS.ORCAMENTO_REPROVADO)
        return compensar(estado, evento.motivo ?? 'Orçamento reprovado pelo cliente');
      break;

    case 'PAGAMENTO':
      if (evento.tipo === EVENTOS.PAGAMENTO_CONFIRMADO)
        return avancar(
          estado,
          { etapa: 'EXECUCAO' },
          'AGUARDANDO_EXECUCAO',
          'Pagamento confirmado; OS liberada para a fila de execução',
          [COMANDOS.LIBERAR_EXECUCAO],
          { pago: true },
        );
      if (evento.tipo === EVENTOS.PAGAMENTO_RECUSADO)
        return compensar(estado, `Pagamento recusado: ${evento.motivo}`);
      break;

    case 'EXECUCAO':
      if (evento.tipo === EVENTOS.EXECUCAO_INICIADA)
        return avancar(estado, {}, 'EM_EXECUCAO', 'Reparo iniciado');
      if (evento.tipo === EVENTOS.EXECUCAO_FINALIZADA)
        return avancar(
          estado,
          { etapa: 'CONCLUIDA', status: 'CONCLUIDA' },
          'FINALIZADA',
          'Reparo finalizado',
        );
      if (evento.tipo === EVENTOS.EXECUCAO_FALHOU)
        return compensar(estado, `Falha na execução: ${evento.motivo}`);
      break;

    case 'CONCLUIDA':
      break;
  }

  return foraDeOrdem(estado, evento);
}

export function decidir(estado: EstadoSaga, evento: EventoSaga): Decisao {
  switch (estado.status) {
    case 'EM_ANDAMENTO':
      return decidirEmAndamento(estado, evento);
    case 'COMPENSANDO':
      return decidirCompensando(estado, evento);
    default:
      return ignorar(estado, `Saga encerrada (${estado.status}); evento ${evento.tipo} ignorado`);
  }
}

export function podeCancelar(estado: EstadoSaga): boolean {
  return estado.status === 'EM_ANDAMENTO' && estado.etapa !== 'CONCLUIDA';
}
