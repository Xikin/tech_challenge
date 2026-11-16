import { NotFoundError } from '../../../shared/errors';
import { iniciarSaga } from '../../../domain/saga/saga-os';
import { montarDadosDoComando, novaMensagem } from '../../saga/contratos';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';
import { loggerSilencioso, type ILogger } from '../../../domain/services/logger.service.interface';
import {
  rastreamentoDesligado,
  type IRastreamento,
} from '../../../domain/services/rastreamento.interface';

export interface CriarOrdemInput {
  clienteId: string;
  veiculoId: string;
  descricao?: string;
  observacoes?: string;
}

export class CriarOrdemUseCase {
  constructor(
    private readonly repo: IOrdemRepository,
    private readonly logger: ILogger = loggerSilencioso,
    private readonly rastreamento: IRastreamento = rastreamentoDesligado,
  ) {}

  async execute(data: CriarOrdemInput) {
    const cliente = await this.repo.buscarCliente(data.clienteId);
    if (!cliente) throw new NotFoundError('Cliente');

    const veiculo = await this.repo.buscarVeiculo(data.veiculoId, data.clienteId);
    if (!veiculo) throw new NotFoundError('Veículo');

    const inicio = iniciarSaga();
    let sagaCriada = '';

    const ordem = await this.repo.criarComSaga(data, {
      estado: inicio.estado,
      observacao: inicio.observacao,
      montarMensagens: (criada, sagaId) => {
        sagaCriada = sagaId;
        return inicio.comandos.map((tipo) =>
          novaMensagem(
            tipo,
            sagaId,
            criada.id,
            montarDadosDoComando(tipo, criada, {}),
            null,
            this.rastreamento,
          ),
        );
      },
    });

    this.logger.info(
      {
        evento: 'os_criada',
        ordemId: ordem.id,
        numeroOS: ordem.numero,
        sagaId: sagaCriada,
        clienteId: data.clienteId,
        veiculoId: data.veiculoId,
      },
      'ordem de serviço criada e saga iniciada',
    );

    return ordem;
  }
}
