import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { CriarPecaInput, AtualizarPecaInput, ListarPecasInput } from "./pecas.schema";

export class PecasRepository {
  private mapPeca<T extends { preco: { toNumber: () => number } | number }>(
    peca: T,
  ): Omit<T, "preco"> & { preco: number } {
    const preco = typeof peca.preco === "number" ? peca.preco : peca.preco.toNumber();
    return { ...peca, preco };
  }

  async criar(data: CriarPecaInput) {
    return this.mapPeca(await prisma.peca.create({ data }));
  }

  async buscarPorNome(nome: string, excludeId?: string) {
    const peca = await prisma.peca.findFirst({
      where: {
        nome: { equals: nome, mode: "insensitive" },
        ativo: true,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return peca ? this.mapPeca(peca) : null;
  }

  async buscarPorId(id: string) {
    const peca = await prisma.peca.findFirst({ where: { id, ativo: true } });
    return peca ? this.mapPeca(peca) : null;
  }

  async listar(params: ListarPecasInput) {
    const { page, limit, busca } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.PecaWhereInput = {
      ativo: true,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: "insensitive" } },
          { descricao: { contains: busca, mode: "insensitive" } },
        ],
      }),
    };
    const [pecas, total] = await Promise.all([
      prisma.peca.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nome: "asc" },
      }),
      prisma.peca.count({ where }),
    ]);
    return { data: pecas.map((p) => this.mapPeca(p)), total };
  }

  async listarTodas() {
    return prisma.peca.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, quantidade: true, estoqueMin: true, unidade: true },
    });
  }

  async atualizar(id: string, data: AtualizarPecaInput) {
    return this.mapPeca(await prisma.peca.update({ where: { id }, data }));
  }

  async incrementarEstoque(id: string, delta: number) {
    return this.mapPeca(
      await prisma.peca.update({
        where: { id },
        data: { quantidade: { increment: delta } },
      }),
    );
  }

  async remover(id: string) {
    return this.mapPeca(await prisma.peca.update({ where: { id }, data: { ativo: false } }));
  }
}
