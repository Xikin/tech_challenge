import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import { detectarTipoPessoa } from "../../../shared/utils/validators";
import type {
  IClienteRepository,
  ClienteRecord,
  CriarClienteData,
  AtualizarClienteData,
  ListarClientesParams,
} from "../../../domain/repositories/clientes.repository.interface";

export class PrismaClienteRepository implements IClienteRepository {
  async criar(data: CriarClienteData): Promise<ClienteRecord> {
    return prisma.cliente.create({
      data: { ...data, tipoPessoa: detectarTipoPessoa(data.cpfCnpj) },
    }) as Promise<ClienteRecord>;
  }

  async buscarPorId(id: string) {
    return prisma.cliente.findFirst({
      where: { id, ativo: true },
      include: {
        veiculos: { where: { ativo: true } },
        ordens: { orderBy: { criadoEm: "desc" }, take: 5 },
      },
    });
  }

  async buscarPorCpfCnpj(cpfCnpj: string): Promise<ClienteRecord | null> {
    return prisma.cliente.findUnique({ where: { cpfCnpj } }) as Promise<ClienteRecord | null>;
  }

  async listar(params: ListarClientesParams) {
    const { page, limit, busca } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.ClienteWhereInput = {
      ativo: true,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: "insensitive" } },
          { cpfCnpj: { contains: busca } },
          { email: { contains: busca, mode: "insensitive" } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nome: "asc" },
        include: { _count: { select: { veiculos: true, ordens: true } } },
      }),
      prisma.cliente.count({ where }),
    ]);
    return { data, total };
  }

  async atualizar(id: string, data: AtualizarClienteData): Promise<ClienteRecord> {
    return prisma.cliente.update({ where: { id }, data }) as Promise<ClienteRecord>;
  }

  async remover(id: string): Promise<ClienteRecord> {
    return prisma.cliente.update({ where: { id }, data: { ativo: false } }) as Promise<ClienteRecord>;
  }
}
