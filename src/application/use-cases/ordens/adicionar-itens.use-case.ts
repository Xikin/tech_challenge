import { BusinessError, NotFoundError, StockError } from '../../../shared/errors';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';

export interface AdicionarItensInput {
  servicos: { servicoId: string }[];
  pecas: { pecaId: string; quantidade: number }[];
}

export class AdicionarItensUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(id: string, data: AdicionarItensInput) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');
    if (!['RECEBIDA', 'EM_DIAGNOSTICO', 'AGUARDANDO_APROVACAO'].includes(os.status))
      throw new BusinessError('Itens só podem ser adicionados nas fases iniciais da OS');

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

    const addServicos = servicos.reduce((acc, s) => acc + Number(s.preco), 0);
    const addPecas = pecas.reduce(
      (acc, { peca, quantidade }) => acc + Number(peca.preco) * quantidade,
      0,
    );
    const novoTotal = Number(os.valorTotal) + addServicos + addPecas;

    await this.repo.adicionarItens({
      ordemId: id,
      servicos: servicos.map((s) => ({ servicoId: s.id, preco: Number(s.preco) })),
      pecas: pecas.map(({ peca, quantidade }) => ({
        pecaId: peca.id,
        quantidade,
        preco: Number(peca.preco),
      })),
      novoTotal,
    });

    const atualizada = await this.repo.buscarPorId(id);
    return atualizada!;
  }
}
