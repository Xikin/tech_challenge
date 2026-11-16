import type { StatusOS } from '../../../domain/enums/status-os.enum';

export const STATUS_LABEL: Record<StatusOS, string> = {
  RECEBIDA: 'Recebida',
  EM_DIAGNOSTICO: 'Em Diagnóstico',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  AGUARDANDO_PAGAMENTO: 'Aguardando Pagamento',
  AGUARDANDO_EXECUCAO: 'Aguardando Execução',
  EM_EXECUCAO: 'Em Execução',
  FINALIZADA: 'Finalizada',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

export const CANCELAVEIS_SEM_SAGA: StatusOS[] = [
  'RECEBIDA',
  'EM_DIAGNOSTICO',
  'AGUARDANDO_APROVACAO',
  'EM_EXECUCAO',
];
