import type { StatusOS } from '../../../domain/enums/status-os.enum';

export const STATUS_LABEL: Record<StatusOS, string> = {
  RECEBIDA: 'Recebida',
  EM_DIAGNOSTICO: 'Em Diagnóstico',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  EM_EXECUCAO: 'Em Execução',
  FINALIZADA: 'Finalizada',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

export const TRANSICOES: Record<StatusOS, StatusOS[]> = {
  RECEBIDA: ['EM_DIAGNOSTICO'],
  EM_DIAGNOSTICO: ['AGUARDANDO_APROVACAO'],
  AGUARDANDO_APROVACAO: ['EM_EXECUCAO'],
  EM_EXECUCAO: ['FINALIZADA'],
  FINALIZADA: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADA: [],
};

export const CANCELAVEIS: StatusOS[] = [
  'RECEBIDA',
  'EM_DIAGNOSTICO',
  'AGUARDANDO_APROVACAO',
  'EM_EXECUCAO',
];

/**
 * Timestamps gravados na OS quando ela entra em determinado status.
 *
 * Precisa ser FUNÇÃO, não constante. Na versão anterior isto era um objeto de
 * módulo e os `new Date()` eram avaliados uma única vez, no carregamento — de
 * modo que toda ordem recebia o horário de boot do processo em vez do horário
 * da transição. O painel de "tempo médio por status" exigido na Fase 3 sairia
 * com durações zeradas ou negativas.
 */
export function timestampsParaStatus(status: StatusOS): Record<string, Date> {
  const agora = new Date();

  switch (status) {
    case 'EM_EXECUCAO':
      return { aprovadoEm: agora, iniciadoEm: agora };
    case 'FINALIZADA':
      return { finalizadoEm: agora };
    case 'ENTREGUE':
      return { entregueEm: agora };
    default:
      return {};
  }
}
