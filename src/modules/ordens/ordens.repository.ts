import { Prisma, StatusOS } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { AtualizarOSInput, ListarOSInput } from "./ordens.schema";

const includeCompleto = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true, email: true, telefone: true } },
  veiculo: true,
  servicos: { include: { servico: true } },
  pecas: { include: { peca: true } },
  historico: { orderBy: { criadoEm: "asc" as const } },
} satisfies Prisma.OrdemServicoInclude;

export class OrdensRepository {
  async buscarPorId(id: string) {
    return prisma.ordemServico.findUnique({ where: { id }, include: includeCompleto });
  }

  async buscarPorNumero(numero: number) {
    return prisma.ordemServico.findUnique({ where: { numero }, include: includeCompleto });
  }

  async buscarStatusPublico(numero: number, cpfCnpj: string) {
    return prisma.ordemServico.findFirst({
      where: { numero, cliente: { cpfCnpj: cpfCnpj.replace(/\D/g, "") } },
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
        veiculo: {
          select: {
            placa: true,
            marca: true,
            modelo: true,
          },
        },
        servicos: {
          select: {
            servico: {
              select: {
                nome: true,
              },
            },
            preco: true,
          },
        },
        historico: {
          orderBy: {
            criadoEm: "asc",
          },
          select: {
            statusNovo: true,
            observacao: true,
            criadoEm: true,
          },
        },
      },
    });
  }

  async listar(params: ListarOSInput) {
    const { page, limit, status, clienteId, veiculoId, dataInicio, dataFim } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.OrdemServicoWhereInput = {
      ...(status && { status }),
      ...(clienteId && { clienteId }),
      ...(veiculoId && { veiculoId }),
      ...((dataInicio || dataFim) && {
        criadoEm: {
          ...(dataInicio && { gte: new Date(dataInicio) }),
          ...(dataFim && { lte: new Date(dataFim) }),
        },
      }),
    };
    const [ordens, total] = await Promise.all([
      prisma.ordemServico.findMany({
        where,
        skip,
        take: limit,
        orderBy: { criadoEm: "desc" },
        include: {
          cliente: {
            select: {
              id: true,
              nome: true,
              cpfCnpj: true,
            },
          },
          veiculo: {
            select: {
              id: true,
              placa: true,
              marca: true,
              modelo: true,
            },
          },
          _count: {
            select: {
              servicos: true,
              pecas: true,
            },
          },
        },
      }),
      prisma.ordemServico.count({ where }),
    ]);
    return { data: ordens, total };
  }

  async criar(dados: {
    clienteId: string;
    veiculoId: string;
    descricao?: string;
    observacoes?: string;
    valorTotal: number;
    servicos: { servicoId: string; preco: number }[];
    pecas: { pecaId: string; quantidade: number; preco: number }[];
  }) {
    return prisma.$transaction(async (tx) => {
      const ordem = await tx.ordemServico.create({
        data: {
          clienteId: dados.clienteId,
          veiculoId: dados.veiculoId,
          descricao: dados.descricao,
          observacoes: dados.observacoes,
          valorTotal: dados.valorTotal,
          servicos: {
            create: dados.servicos.map((s) => ({
              servicoId: s.servicoId,
              preco: s.preco,
            })),
          },
          pecas: {
            create: dados.pecas.map((p) => ({
              pecaId: p.pecaId,
              quantidade: p.quantidade,
              preco: p.preco,
            })),
          },
          historico: {
            create: {
              statusNovo: StatusOS.RECEBIDA,
              observacao: "Ordem de serviço criada",
            },
          },
        },
        include: includeCompleto,
      });
      for (const p of dados.pecas) {
        await tx.peca.update({
          where: { id: p.pecaId },
          data: {
            quantidade: {
              decrement: p.quantidade,
            },
          },
        });
      }
      return ordem;
    });
  }

  async atualizar(id: string, data: AtualizarOSInput) {
    return prisma.ordemServico.update({
      where: { id },
      data,
      include: includeCompleto,
    });
  }

  async avancarStatus(dados: {
    id: string;
    statusAtual: StatusOS;
    novoStatus: StatusOS;
    observacao?: string;
    tempoReal?: number;
    qtdServicos: number;
    timestampExtra: object;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.ordemServico.update({
        where: { id: dados.id },
        data: {
          status: dados.novoStatus,
          ...dados.timestampExtra,
        },
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

  async reprovar(dados: {
    id: string;
    observacao?: string;
    pecas: {
      pecaId: string;
      quantidade: number;
    }[];
  }) {
    return prisma.$transaction(async (tx) => {
      for (const p of dados.pecas) {
        await tx.peca.update({
          where: { id: p.pecaId },
          data: {
            quantidade: {
              increment: p.quantidade,
            },
          },
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
          observacao: dados.observacao ?? "Cliente não aprovou o orçamento",
        },
      });
    });
  }

  async adicionarItens(dados: {
    ordemId: string;
    servicos: { servicoId: string; preco: number }[];
    pecas: { pecaId: string; quantidade: number; preco: number }[];
    novoTotal: number;
  }) {
    return prisma.$transaction(async (tx) => {
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
            data: {
              quantidade: {
                decrement: p.quantidade,
              },
            },
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
    return prisma.veiculo.findFirst({
      where: {
        id: veiculoId,
        ativo: true,
        clienteId,
      },
    });
  }

  async cancelar(dados: {
    id: string;
    statusAnterior: StatusOS;
    motivo?: string;
    pecas: { pecaId: string; quantidade: number }[];
  }) {
    return prisma.$transaction(async (tx) => {
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
          observacao: dados.motivo ?? "Ordem de serviço cancelada",
        },
      });
    });
  }
}
