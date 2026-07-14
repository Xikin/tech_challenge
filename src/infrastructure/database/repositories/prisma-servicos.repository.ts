import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import type {
  IServicoRepository,
  ServicoRecord,
  CriarServicoData,
  AtualizarServicoData,
  ListarServicosParams,
} from '../../../domain/repositories/servicos.repository.interface';

type PrismaRawServico = { preco: { toNumber(): number } | number } & Record<string, unknown>;

function mapServico<T extends PrismaRawServico>(servico: T): Omit<T, 'preco'> & { preco: number } {
  const preco = typeof servico.preco === 'number' ? servico.preco : servico.preco.toNumber();
  return { ...servico, preco };
}

export class PrismaServicoRepository implements IServicoRepository {
  async criar(data: CriarServicoData): Promise<ServicoRecord> {
    return mapServico(await prisma.servico.create({ data })) as ServicoRecord;
  }

  async buscarPorId(id: string): Promise<ServicoRecord | null> {
    const servico = await prisma.servico.findFirst({
      where: { id, ativo: true },
    });
    return servico ? (mapServico(servico) as ServicoRecord) : null;
  }

  async buscarPorNome(nome: string, excludeId?: string): Promise<ServicoRecord | null> {
    const servico = await prisma.servico.findFirst({
      where: {
        nome: { equals: nome, mode: 'insensitive' },
        ativo: true,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return servico ? (mapServico(servico) as ServicoRecord) : null;
  }

  async listar(params: ListarServicosParams) {
    const { page, limit, busca } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.ServicoWhereInput = {
      ativo: true,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: 'insensitive' } },
          { descricao: { contains: busca, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      prisma.servico.findMany({ where, skip, take: limit, orderBy: { nome: 'asc' } }),
      prisma.servico.count({ where }),
    ]);
    return { data: data.map((s) => mapServico(s) as ServicoRecord), total };
  }

  async atualizar(id: string, data: AtualizarServicoData): Promise<ServicoRecord> {
    return mapServico(await prisma.servico.update({ where: { id }, data })) as ServicoRecord;
  }

  async remover(id: string): Promise<ServicoRecord> {
    return mapServico(
      await prisma.servico.update({
        where: { id },
        data: { ativo: false },
      }),
    ) as ServicoRecord;
  }

  async buscarEmOSAtiva(id: string) {
    return prisma.itemServicoOS.findFirst({
      where: { servicoId: id, ordem: { status: { notIn: ['FINALIZADA', 'ENTREGUE'] } } },
    });
  }

  async buscarTemposReais(id: string) {
    return prisma.itemServicoOS.findMany({
      where: { servicoId: id, tempoReal: { not: null } },
      select: { tempoReal: true },
    });
  }
}
