import { prisma } from "../../config/prisma";
import type { CriarVeiculoInput, AtualizarVeiculoInput } from "./veiculos.schema";

export class VeiculosRepository {
  async criar(data: CriarVeiculoInput) {
    return prisma.veiculo.create({
      data,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });
  }

  async buscarPorId(id: string) {
    return prisma.veiculo.findFirst({
      where: { id, ativo: true },
      include: {
        cliente: true,
        ordens: { orderBy: { criadoEm: "desc" }, take: 5 },
      },
    });
  }

  async buscarPorPlaca(placa: string) {
    return prisma.veiculo.findFirst({
      where: { placa: placa.toUpperCase(), ativo: true },
      include: { cliente: true },
    });
  }

  async buscarPorIdExato(id: string) {
    return prisma.veiculo.findUnique({ where: { id } });
  }

  async buscarPorPlacaExata(placa: string) {
    return prisma.veiculo.findUnique({ where: { placa } });
  }

  async listar(clienteId?: string) {
    return prisma.veiculo.findMany({
      where: {
        ativo: true,
        ...(clienteId && { clienteId }),
      },
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            cpfCnpj: true,
          },
        },
      },
      orderBy: { placa: "asc" },
    });
  }

  async atualizar(id: string, data: AtualizarVeiculoInput) {
    return prisma.veiculo.update({
      where: { id },
      data,
    });
  }

  async remover(id: string) {
    return prisma.veiculo.update({
      where: { id },
      data: { ativo: false },
    });
  }

  async clienteExiste(clienteId: string) {
    return prisma.cliente.findFirst({
      where: {
        id: clienteId,
        ativo: true,
      },
    });
  }
}
