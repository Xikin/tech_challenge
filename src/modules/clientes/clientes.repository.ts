import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type {
  CriarClienteInput,
  AtualizarClienteInput,
  ListarClientesInput,
} from "./clientes.schema";
import { detectarTipoPessoa } from "../../shared/utils/validators";

export class ClientesRepository {
  async criar(data: CriarClienteInput) {
    return prisma.cliente.create({
      data: { ...data, tipoPessoa: detectarTipoPessoa(data.cpfCnpj) },
    });
  }

  async buscarPorCpfCnpj(cpfCnpj: string) {
    return prisma.cliente.findUnique({ where: { cpfCnpj } });
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

  async listar(params: ListarClientesInput) {
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

  async atualizar(id: string, data: AtualizarClienteInput) {
    return prisma.cliente.update({ where: { id }, data });
  }

  async remover(id: string) {
    return prisma.cliente.update({ where: { id }, data: { ativo: false } });
  }
}
