import { prisma } from '../../../config/prisma';
import type {
  IVeiculoRepository,
  VeiculoRecord,
  CriarVeiculoData,
  AtualizarVeiculoData,
} from '../../../domain/repositories/veiculos.repository.interface';

export class PrismaVeiculoRepository implements IVeiculoRepository {
  async criar(data: CriarVeiculoData) {
    return prisma.veiculo.create({
      data,
      include: { cliente: { select: { id: true, nome: true } } },
    });
  }

  async buscarPorId(id: string) {
    return prisma.veiculo.findFirst({
      where: { id, ativo: true },
      include: { cliente: true, ordens: { orderBy: { criadoEm: 'desc' }, take: 5 } },
    });
  }

  async buscarPorPlaca(placa: string) {
    return prisma.veiculo.findFirst({
      where: { placa: placa.toUpperCase(), ativo: true },
      include: { cliente: true },
    });
  }

  async buscarPorPlacaExata(placa: string): Promise<VeiculoRecord | null> {
    return prisma.veiculo.findUnique({ where: { placa } }) as Promise<VeiculoRecord | null>;
  }

  async listar(clienteId?: string) {
    return prisma.veiculo.findMany({
      where: { ativo: true, ...(clienteId && { clienteId }) },
      include: { cliente: { select: { id: true, nome: true, cpfCnpj: true } } },
      orderBy: { placa: 'asc' },
    });
  }

  async atualizar(id: string, data: AtualizarVeiculoData): Promise<VeiculoRecord> {
    return prisma.veiculo.update({ where: { id }, data }) as Promise<VeiculoRecord>;
  }

  async remover(id: string): Promise<VeiculoRecord> {
    return prisma.veiculo.update({
      where: { id },
      data: { ativo: false },
    }) as Promise<VeiculoRecord>;
  }

  async clienteExiste(clienteId: string) {
    return prisma.cliente.findFirst({ where: { id: clienteId, ativo: true } });
  }
}
