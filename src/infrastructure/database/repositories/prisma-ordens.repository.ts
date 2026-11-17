import { Prisma, StatusOS } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { enfileirarNoOutbox } from './prisma-outbox';
import { marcosDoStatus } from '../../../domain/ordens/marcos-de-status';
import type {
  IOrdemRepository,
  ListarOrdensParams,
  CriarOrdemData,
  InicioSaga,
  MudancaDeStatusData,
  OrdemRecord,
} from '../../../domain/repositories/ordens.repository.interface';

const includeCompleto = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true, email: true, telefone: true } },
  veiculo: true,
  itens: { orderBy: { tipo: 'asc' as const } },
  historico: { orderBy: { criadoEm: 'asc' as const } },
  saga: {
    select: {
      id: true,
      etapa: true,
      status: true,
      motivoFalha: true,
      compensacoesPendentes: true,
    },
  },
} satisfies Prisma.OrdemServicoInclude;

type DecimalValue = { toNumber(): number } | number;

function toNumber(value: DecimalValue): number {
  return typeof value === 'number' ? value : value.toNumber();
}

function mapOrdemCompleta<
  T extends { valorTotal: DecimalValue; itens: { precoUnitario: DecimalValue }[] },
>(ordem: T) {
  return {
    ...ordem,
    valorTotal: toNumber(ordem.valorTotal),
    itens: ordem.itens.map((i) => ({ ...i, precoUnitario: toNumber(i.precoUnitario) })),
  };
}

function mapValorTotal<T extends { valorTotal: DecimalValue }>(ordem: T) {
  return { ...ordem, valorTotal: toNumber(ordem.valorTotal) };
}

const PRIORIDADE_NA_LISTAGEM: Record<string, number> = {
  EM_EXECUCAO: 1,
  AGUARDANDO_EXECUCAO: 2,
  AGUARDANDO_PAGAMENTO: 3,
  AGUARDANDO_APROVACAO: 4,
  EM_DIAGNOSTICO: 5,
  RECEBIDA: 6,
  CANCELADA: 7,
  FINALIZADA: 8,
  ENTREGUE: 9,
};

export class PrismaOrdemRepository implements IOrdemRepository {
  async buscarPorId(id: string) {
    const ordem = await prisma.ordemServico.findUnique({ where: { id }, include: includeCompleto });
    return ordem ? (mapOrdemCompleta(ordem) as OrdemRecord) : null;
  }

  async buscarPorNumero(numero: number) {
    const ordem = await prisma.ordemServico.findUnique({
      where: { numero },
      include: includeCompleto,
    });
    return ordem ? (mapOrdemCompleta(ordem) as OrdemRecord) : null;
  }

  async buscarStatusPublico(numero: number, cpfCnpj: string) {
    const ordem = await prisma.ordemServico.findFirst({
      where: { numero, cliente: { cpfCnpj: cpfCnpj.replace(/\D/g, '') } },
      select: {
        id: true,
        numero: true,
        status: true,
        valorTotal: true,
        linkPagamento: true,
        criadoEm: true,
        aprovadoEm: true,
        pagoEm: true,
        iniciadoEm: true,
        finalizadoEm: true,
        entregueEm: true,
        veiculo: { select: { placa: true, marca: true, modelo: true } },
        itens: {
          orderBy: { tipo: 'asc' },
          select: { tipo: true, nome: true, quantidade: true, precoUnitario: true },
        },
        historico: {
          orderBy: { criadoEm: 'asc' },
          select: { statusNovo: true, observacao: true, criadoEm: true },
        },
      },
    });
    return ordem ? mapOrdemCompleta(ordem) : null;
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
          _count: { select: { itens: true } },
        },
      }),
      prisma.ordemServico.count({ where }),
    ]);

    const ordenadas = todasOrdens.sort(
      (a, b) =>
        (PRIORIDADE_NA_LISTAGEM[a.status] ?? 99) - (PRIORIDADE_NA_LISTAGEM[b.status] ?? 99) ||
        a.criadoEm.getTime() - b.criadoEm.getTime(),
    );

    return { data: ordenadas.slice(skip, skip + limit).map(mapValorTotal), total };
  }

  async criarComSaga(dados: CriarOrdemData, saga: InicioSaga) {
    return prisma.$transaction(async (tx) => {
      const criada = await tx.ordemServico.create({
        data: {
          clienteId: dados.clienteId,
          veiculoId: dados.veiculoId,
          descricao: dados.descricao,
          observacoes: dados.observacoes,
          historico: { create: { statusNovo: StatusOS.RECEBIDA, observacao: saga.observacao } },
        },
        include: includeCompleto,
      });

      const sagaCriada = await tx.sagaOS.create({
        data: {
          ordemId: criada.id,
          etapa: saga.estado.etapa,
          status: saga.estado.status,
          participantes: saga.estado.participantes,
          compensacoesPendentes: saga.estado.compensacoesPendentes,
          motivoFalha: saga.estado.motivoFalha,
        },
      });

      const ordem = {
        ...mapOrdemCompleta(criada),
        saga: {
          id: sagaCriada.id,
          etapa: sagaCriada.etapa,
          status: sagaCriada.status,
          motivoFalha: sagaCriada.motivoFalha,
          compensacoesPendentes: sagaCriada.compensacoesPendentes,
        },
      } as OrdemRecord;

      const saidas = saga.montarMensagens(ordem, sagaCriada.id);
      await enfileirarNoOutbox(tx, saidas);
      if (saidas.length)
        await tx.passoSaga.createMany({
          data: saidas.map((s) => ({
            sagaId: sagaCriada.id,
            direcao: 'ENVIADA' as const,
            tipo: s.mensagem.tipo,
            mensagemId: s.mensagem.id,
          })),
        });

      return ordem;
    });
  }

  async atualizar(id: string, data: { descricao?: string; observacoes?: string }) {
    const ordem = await prisma.ordemServico.update({
      where: { id },
      data,
      include: includeCompleto,
    });
    return mapOrdemCompleta(ordem) as OrdemRecord;
  }

  async mudarStatus(dados: MudancaDeStatusData): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.ordemServico.update({
        where: { id: dados.id },
        data: { status: dados.novoStatus, ...marcosDoStatus(dados.novoStatus) },
      });
      await tx.historicoOS.create({
        data: {
          ordemId: dados.id,
          statusAnterior: dados.statusAnterior,
          statusNovo: dados.novoStatus,
          observacao: dados.observacao,
        },
      });
    });
  }

  async buscarCliente(id: string) {
    return prisma.cliente.findFirst({ where: { id, ativo: true } });
  }

  async buscarVeiculo(veiculoId: string, clienteId: string) {
    return prisma.veiculo.findFirst({ where: { id: veiculoId, ativo: true, clienteId } });
  }
}
