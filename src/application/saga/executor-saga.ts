import { montarDadosDoComando, novaMensagem, type ContextoDoComando } from './contratos';
import type { NotificadorCliente } from './notificador-cliente';
import type { Decisao } from '../../domain/saga/saga-os';
import type { OrdemRecord } from '../../domain/repositories/ordens.repository.interface';
import type {
  ISagaRepository,
  SagaRecord,
} from '../../domain/repositories/saga.repository.interface';
import { chaveConsultaPublica, type ICache } from '../../domain/services/cache.service.interface';
import type { ILogger } from '../../domain/services/logger.service.interface';
import type { IRastreamento } from '../../domain/services/rastreamento.interface';

export interface OrigemDaDecisao {
  mensagemId: string;
  tipo: string;
  consumidor: string | null;
}

export class ExecutorDeSaga {
  constructor(
    private readonly sagas: ISagaRepository,
    private readonly notificador: NotificadorCliente,
    private readonly cache: ICache,
    private readonly rastreamento: IRastreamento,
    private readonly logger: ILogger,
  ) {}

  async aplicar(
    ordem: OrdemRecord,
    saga: SagaRecord,
    decisao: Decisao,
    origem: OrigemDaDecisao,
  ): Promise<void> {
    const contexto: ContextoDoComando = {
      itens: decisao.efeitos.itens,
      motivo: decisao.estado.motivoFalha ?? undefined,
    };
    const ordemComEfeitos: OrdemRecord = {
      ...ordem,
      orcamentoId: decisao.efeitos.orcamentoId ?? ordem.orcamentoId,
    };
    const saidas = decisao.comandos.map((tipo) =>
      novaMensagem(
        tipo,
        saga.id,
        ordem.id,
        montarDadosDoComando(tipo, ordemComEfeitos, contexto),
        origem.mensagemId,
        this.rastreamento,
      ),
    );

    const mudancaDeStatus =
      decisao.statusOS && decisao.statusOS !== ordem.status
        ? { anterior: ordem.status, novo: decisao.statusOS, observacao: decisao.observacao }
        : null;

    await this.sagas.aplicarTransicao({
      sagaId: saga.id,
      ordemId: ordem.id,
      versaoEsperada: saga.versao,
      estado: decisao.estado,
      mudancaDeStatus,
      efeitos: decisao.efeitos,
      passos: [
        {
          direcao: 'RECEBIDA',
          tipo: origem.tipo,
          mensagemId: origem.mensagemId,
          detalhe: decisao.observacao,
        },
        ...saidas.map((s) => ({
          direcao: 'ENVIADA' as const,
          tipo: s.mensagem.tipo,
          mensagemId: s.mensagem.id,
        })),
      ],
      saidas,
      mensagemProcessada: origem.consumidor
        ? { id: origem.mensagemId, consumidor: origem.consumidor }
        : null,
    });

    const registro = {
      evento: decisao.aceita ? 'saga_transicao' : 'saga_evento_ignorado',
      sagaId: saga.id,
      ordemId: ordem.id,
      numeroOS: ordem.numero,
      mensagemId: origem.mensagemId,
      tipoMensagem: origem.tipo,
      etapaAnterior: saga.etapa,
      etapa: decisao.estado.etapa,
      statusSagaAnterior: saga.status,
      statusSaga: decisao.estado.status,
      comandos: decisao.comandos,
      motivo: decisao.observacao,
    };
    if (decisao.aceita) this.logger.info(registro, 'saga avançou');
    else this.logger.warn(registro, 'evento ignorado pela saga');

    if (decisao.estado.status === 'COMPENSANDO' && saga.status !== 'COMPENSANDO') {
      this.logger.warn(
        {
          evento: 'saga_compensacao_iniciada',
          sagaId: saga.id,
          ordemId: ordem.id,
          numeroOS: ordem.numero,
          etapa: decisao.estado.etapa,
          motivo: decisao.estado.motivoFalha,
          compensacoes: decisao.estado.compensacoesPendentes,
        },
        'saga iniciou compensação',
      );
    }

    if (!mudancaDeStatus) return;

    await this.cache.remover(chaveConsultaPublica(ordem.numero));

    const entradaNoStatusAtual = ordem.historico.at(-1)?.criadoEm ?? ordem.criadoEm;
    this.logger.info(
      {
        evento: 'os_status_alterado',
        ordemId: ordem.id,
        numeroOS: ordem.numero,
        sagaId: saga.id,
        statusAnterior: mudancaDeStatus.anterior,
        statusNovo: mudancaDeStatus.novo,
        duracaoNoStatusAnteriorMs: Date.now() - new Date(entradaNoStatusAtual).getTime(),
        valorTotal: decisao.efeitos.valorTotal ?? Number(ordem.valorTotal),
      },
      'ordem de serviço mudou de status',
    );

    this.notificador.notificar(ordem, mudancaDeStatus, decisao.efeitos);
  }
}
