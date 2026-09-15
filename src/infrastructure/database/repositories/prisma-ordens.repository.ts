import { Prisma, StatusOS } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import type {
  IOrdemRepository,
  ListarOrdensParams,
  CriarOrdemData,
  AvancarStatusData,
  ReprovarOrdemData,
  CancelarOrdemData,
  AdicionarItensData,
} from '../../../domain/repositories/ordens.repository.interface';

const includeCompleto = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true, email: true, telefone: true } },
  veiculo: true,
  servicos: { include: { servico: true } },
  pecas: { include: { peca: true } },
  historico: { orderBy: { criadoEm: 'asc' as const } },
} satisfies Prisma.OrdemServicoInclude;

type DecimalValue = { toNumber(): number } | number;

function toNumber(value: DecimalValue): number {
  return typeof value === 'number' ? value : value.toNumber();
}

function mapOrdemCompleta<
  T extends {
    valorTotal: DecimalValue;
    servicos: { preco: DecimalValue; servico: { preco: DecimalValue } }[];
    pecas: { preco: DecimalValue; peca: { preco: DecimalValue } }[];
  },
>(ordem: T) {
  return {
    ...ordem,
    valorTotal: toNumber(ordem.valorTotal),
    servicos: ordem.servicos.map((s) => ({
      ...s,
      preco: toNumber(s.preco),
      servico: { ...s.servico, preco: toNumber(s.servico.preco) },
    })),
    pecas: ordem.pecas.map((p) => ({
      ...p,
      preco: toNumber(p.preco),
      peca: { ...p.peca, preco: toNumber(p.peca.preco) },
    })),
  };
}

function mapValorTotal<T extends { valorTotal: DecimalValue }>(ordem: T) {
  return { ...ordem, valorTotal: toNumber(ordem.valorTotal) };
}

const STATUS_PRIORITY: Record<string, number> = {
  EM_EXECUCAO: 1,
  AGUARDANDO_APROVACAO: 2,
  EM_DIAGNOSTICO: 3,
  RECEBIDA: 4,
  CANCELADA: 5,
  FINALIZADA: 6,
  ENTREGUE: 7,
};

export class PrismaOrdemRepository implements IOrdemRepository {
  async buscarPorId(id: string) {
    const ordem = await prisma.ordemServico.findUnique({ where: { id }, include: includeCompleto });
    return ordem ? mapOrdemCompleta(ordem) : null;
  }

  async buscarPorNumero(numero: number) {
    const ordem = await prisma.ordemServico.findUnique({
      where: { numero },
      include: includeCompleto,
    });
    return ordem ? mapOrdemCompleta(ordem) : null;
  }

  async buscarStatusPublico(numero: number, cpfCnpj: string) {
    const ordem = await prisma.ordemServico.findFirst({
      where: { numero, cliente: { cpfCnpj: cpfCnpj.replace(/\D/g, '') } },
      select: {
        id: true,
        numero: true,
        status: true,
        valorTotal: true,
        criadoEm: true,
        aprovadoEm: true,
        iniciadoEm: true,
        finalizadoEm: true,
        entregueEm: true,
        veiculo: { select: { placa: true, marca: true, modelo: true } },
        servicos: { select: { servico: { select: { nome: true } }, preco: true } },
        historico: {
          orderBy: { criadoEm: 'asc' },
          select: { statusNovo: true, observacao: true, criadoEm: true },
        },
      },
    });
    if (!ordem) return null;
    return {
      ...ordem,
      valorTotal: toNumber(ordem.valorTotal),
      servicos: ordem.servicos.map((s) => ({ ...s, preco: toNumber(s.preco) })),
    };
  }

  async listar(params: ListarOrdensParams) {
    const { page, limit, status, clienteId, veiculoId, dataInicio, dataFim } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.OrdemServicoWhereInput = {
      ...(status ? { status } : { status: { notIn: [StatusOS.FINALIZADA, StatusOS.ENTREGUE] } }),
      ...(clienteId && { clienteId }),
      ...(veiculoId && { veiculoId }),
      ...((dataInicio || dataFim) && {
        criadoEm: {
          ...(dataInicio && { gte: new Date(dataInicio) }),
          ...(dataFim && { lte: new Date(dataFim) }),
        },
      }),
    };

    const [todasOrdens, total] = await Promise.all([
      prisma.ordemServico.findMany({
        where,
        orderBy: { criadoEm: 'asc' },
        include: {
          cliente: { select: { id: true, nome: true, cpfCnpj: true } },
          veiculo: { select: { id: true, placa: true, marca: true, modelo: true } },
          _count: { select: { servicos: true, pecas: true } },
        },
      }),
      prisma.ordemServico.count({ where }),
    ]);

    const ordenadas = todasOrdens.sort(
      (a, b) =>
        (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99) ||
        a.criadoEm.getTime() - b.criadoEm.getTime(),
    );

    return { data: ordenadas.slice(skip, skip + limit).map(mapValorTotal), total };
  }

  async criar(dados: CriarOrdemData) {
    return prisma.$transaction(async (tx) => {
      const ordem = await tx.ordemServico.create({
        data: {
          clienteId: dados.clienteId,
          veiculoId: dados.veiculoId,
          descricao: dados.descricao,
          observacoes: dados.observacoes,
          valorTotal: dados.valorTotal,
          servicos: {
            create: dados.servicos.map((s) => ({ servicoId: s.servicoId, preco: s.preco })),
          },
          pecas: {
            create: dados.pecas.map((p) => ({
              pecaId: p.pecaId,
              quantidade: p.quantidade,
              preco: p.preco,
            })),
          },
          historico: {
            create: { statusNovo: StatusOS.RECEBIDA, observacao: 'Ordem de serviço criada' },
          },
        },
        include: includeCompleto,
      });
      for (const p of dados.pecas) {
        await tx.peca.update({
          where: { id: p.pecaId },
          data: { quantidade: { decrement: p.quantidade } },
        });
      }
      return mapOrdemCompleta(ordem);
    });
  }

  async atualizar(id: string, data: { descricao?: string; observacoes?: string }) {
    const ordem = await prisma.ordemServico.update({
      where: { id },
      data,
      include: includeCompleto,
    });
    return mapOrdemCompleta(ordem);
  }

  async avancarStatus(dados: AvancarStatusData): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.ordemServico.update({
        where: { id: dados.id },
        data: { status: dados.novoStatus, ...dados.timestampExtra },
      });
      await tx.historicoOS.create({
        data: {
          ordemId: dados.id,
          statusAnterior: dados.statusAtual,
          statusNovo: dados.novoStatus,
          observacao: dados.observacao,
        },
      });
      if (dados.novoStatus === StatusOS.FINALIZADA && dados.tempoReal && dados.qtdServicos > 0) {
        const tempoPorServico = Math.round(dados.tempoReal / dados.qtdServicos);
        const itens = await tx.itemServicoOS.findMany({
          where: { ordemId: dados.id },
          select: { id: true },
        });
        for (const item of itens) {
          await tx.itemServicoOS.update({
            where: { id: item.id },
            data: { tempoReal: tempoPorServico },
          });
        }
      }
    });
  }

  async reprovar(dados: ReprovarOrdemData): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const p of dados.pecas) {
        await tx.peca.update({
          where: { id: p.pecaId },
          data: { quantidade: { increment: p.quantidade } },
        });
      }
      await tx.ordemServico.update({
        where: { id: dados.id },
        data: { status: StatusOS.EM_DIAGNOSTICO },
      });
      await tx.historicoOS.create({
        data: {
          ordemId: dados.id,
          statusAnterior: StatusOS.AGUARDANDO_APROVACAO,
          statusNovo: StatusOS.EM_DIAGNOSTICO,
          observacao: dados.observacao ?? 'Cliente não aprovou o orçamento',
        },
      });
    });
  }

  async cancelar(dados: CancelarOrdemData): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const p of dados.pecas) {
        await tx.peca.update({
          where: { id: p.pecaId },
          data: { quantidade: { increment: p.quantidade } },
        });
      }
      await tx.ordemServico.update({
        where: { id: dados.id },
        data: { status: StatusOS.CANCELADA },
      });
      await tx.historicoOS.create({
        data: {
          ordemId: dados.id,
          statusAnterior: dados.statusAnterior,
          statusNovo: StatusOS.CANCELADA,
          observacao: dados.motivo ?? 'Ordem de serviço cancelada',
        },
      });
    });
  }

  async adicionarItens(dados: AdicionarItensData): Promise<void> {
    await prisma.$transaction(async (tx) => {
      if (dados.servicos.length) {
        await tx.itemServicoOS.createMany({
          data: dados.servicos.map((s) => ({
            ordemId: dados.ordemId,
            servicoId: s.servicoId,
            preco: s.preco,
          })),
        });
      }
      if (dados.pecas.length) {
        await tx.itemPecaOS.createMany({
          data: dados.pecas.map((p) => ({
            ordemId: dados.ordemId,
            pecaId: p.pecaId,
            quantidade: p.quantidade,
            preco: p.preco,
          })),
        });
        for (const p of dados.pecas) {
          await tx.peca.update({
            where: { id: p.pecaId },
            data: { quantidade: { decrement: p.quantidade } },
          });
        }
      }
      await tx.ordemServico.update({
        where: { id: dados.ordemId },
        data: { valorTotal: dados.novoTotal },
      });
    });
  }

  async buscarServico(id: string) {
    return prisma.servico.findFirst({ where: { id, ativo: true } });
  }

  async buscarPeca(id: string) {
    return prisma.peca.findFirst({ where: { id, ativo: true } });
  }

  async buscarCliente(id: string) {
    return prisma.cliente.findFirst({ where: { id, ativo: true } });
  }

  async buscarVeiculo(veiculoId: string, clienteId: string) {
    return prisma.veiculo.findFirst({ where: { id: veiculoId, ativo: true, clienteId } });
  }
}
