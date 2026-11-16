import type { StatusOS } from '../enums/status-os.enum';

export function marcosDoStatus(status: StatusOS, agora = new Date()): Record<string, Date> {
  switch (status) {
    case 'AGUARDANDO_PAGAMENTO':
      return { aprovadoEm: agora };
    case 'AGUARDANDO_EXECUCAO':
      return { pagoEm: agora };
    case 'EM_EXECUCAO':
      return { iniciadoEm: agora };
    case 'FINALIZADA':
      return { finalizadoEm: agora };
    case 'ENTREGUE':
      return { entregueEm: agora };
    default:
      return {};
  }
}
