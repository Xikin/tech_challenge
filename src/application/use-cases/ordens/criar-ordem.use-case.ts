import { NotFoundError, StockError } from '../../../shared/errors';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';

export interface CriarOrdemInput {
  clienteId: string;
  veiculoId: string;
  descricao?: string;
  observacoes?: string;
  servicos: { servicoId: string }[];
  pecas: { pecaId: string; quantidade: number }[];
}

export class CriarOrdemUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(data: CriarOrdemInput) {
    const cliente = await this.repo.buscarCliente(data.clienteId);
    if (!cliente) throw new NotFoundError('Cliente');

    const veiculo = await this.repo.buscarVeiculo(data.veiculoId, data.clienteId);
    if (!veiculo) throw new NotFoundError('Veículo');

    const servicos = await Promise.all(
      data.servicos.map(async ({ servicoId }) => {
        const s = await this.repo.buscarServico(servicoId);
        if (!s) throw new NotFoundError(`Serviço (id: ${servicoId})`);
        return s;
      }),
    );

    const pecas = await Promise.all(
      data.pecas.map(async ({ pecaId, quantidade }) => {
        const p = await this.repo.buscarPeca(pecaId);
        if (!p) throw new NotFoundError(`Peça (id: ${pecaId})`);
        if (p.quantidade < quantidade)
          throw new StockError(
            `Estoque insuficiente para "${p.nome}". Disponível: ${p.quantidade}`,
          );
        return { peca: p, quantidade };
      }),
    );

    const totalServicos = servicos.reduce((acc, s) => acc + Number(s.preco), 0);
    const totalPecas = pecas.reduce(
      (acc, { peca, quantidade }) => acc + Number(peca.preco) * quantidade,
      0,
    );

    return this.repo.criar({
      clienteId: data.clienteId,
      veiculoId: data.veiculoId,
      descricao: data.descricao,
      observacoes: data.observacoes,
      valorTotal: totalServicos + totalPecas,
      servicos: servicos.map((s) => ({ servicoId: s.id, preco: Number(s.preco) })),
      pecas: pecas.map(({ peca, quantidade }) => ({
        pecaId: peca.id,
        quantidade,
        preco: Number(peca.preco),
      })),
    });
  }
}
