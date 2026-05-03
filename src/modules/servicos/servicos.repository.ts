import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type {
  CriarServicoInput,
  AtualizarServicoInput,
  ListarServicosInput,
} from "./servicos.schema";

export class ServicosRepository {
  async criar(data: CriarServicoInput) {
    return prisma.servico.create({ data });
  }

  async buscarPorNome(nome: string, excludeId?: string) {
    return prisma.servico.findFirst({
      where: {
        nome: { equals: nome, mode: "insensitive" },
        ativo: true,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
  }

  async buscarPorId(id: string) {
    return prisma.servico.findFirst({ where: { id, ativo: true } });
  }

  async listar(params: ListarServicosInput) {
    const { page, limit, busca } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.ServicoWhereInput = {
      ativo: true,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: "insensitive" } },
          { descricao: { contains: busca, mode: "insensitive" } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      prisma.servico.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nome: "asc" },
      }),
      prisma.servico.count({ where }),
    ]);
    return { data, total };
  }

  async atualizar(id: string, data: AtualizarServicoInput) {
    return prisma.servico.update({
      where: { id },
      data,
    });
  }

  async remover(id: string) {
    return prisma.servico.update({
      where: { id },
      data: { ativo: false },
    });
  }

  async buscarEmOSAtiva(id: string) {
    return prisma.itemServicoOS.findFirst({
      where: {
        servicoId: id,
        ordem: {
          status: {
            notIn: ["FINALIZADA", "ENTREGUE"],
          },
        },
      },
    });
  }

  async buscarTemposReais(id: string) {
    return prisma.itemServicoOS.findMany({
      where: {
        servicoId: id,
        tempoReal: { not: null },
      },
      select: { tempoReal: true },
    });
  }
}
