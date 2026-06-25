import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import type {
  IPecaRepository,
  PecaRecord,
  PecaMinima,
  CriarPecaData,
  AtualizarPecaData,
  ListarPecasParams,
} from "../../../domain/repositories/pecas.repository.interface";

type PrismaRawPeca = { preco: { toNumber(): number } | number } & Record<string, unknown>;

function mapPeca<T extends PrismaRawPeca>(peca: T): Omit<T, "preco"> & { preco: number } {
  const preco = typeof peca.preco === "number" ? peca.preco : peca.preco.toNumber();
  return { ...peca, preco };
}

export class PrismaPecaRepository implements IPecaRepository {
  async criar(data: CriarPecaData): Promise<PecaRecord> {
    return mapPeca(await prisma.peca.create({ data })) as PecaRecord;
  }

  async buscarPorId(id: string): Promise<PecaRecord | null> {
    const peca = await prisma.peca.findFirst({ where: { id, ativo: true } });
    return peca ? (mapPeca(peca) as PecaRecord) : null;
  }

  async buscarPorNome(nome: string, excludeId?: string): Promise<PecaRecord | null> {
    const peca = await prisma.peca.findFirst({
      where: {
        nome: { equals: nome, mode: "insensitive" },
        ativo: true,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return peca ? (mapPeca(peca) as PecaRecord) : null;
  }

  async listar(params: ListarPecasParams) {
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
      prisma.peca.findMany({ where, skip, take: limit, orderBy: { nome: "asc" } }),
      prisma.peca.count({ where }),
    ]);
    return { data: pecas.map((p) => mapPeca(p) as PecaRecord), total };
  }

  async listarTodas(): Promise<PecaMinima[]> {
    return prisma.peca.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, quantidade: true, estoqueMin: true, unidade: true },
    });
  }

  async atualizar(id: string, data: AtualizarPecaData): Promise<PecaRecord> {
    return mapPeca(await prisma.peca.update({ where: { id }, data })) as PecaRecord;
  }

  async incrementarEstoque(id: string, delta: number): Promise<PecaRecord> {
    return mapPeca(
      await prisma.peca.update({ where: { id }, data: { quantidade: { increment: delta } } }),
    ) as PecaRecord;
  }

  async remover(id: string): Promise<PecaRecord> {
    return mapPeca(await prisma.peca.update({ where: { id }, data: { ativo: false } })) as PecaRecord;
  }
}
