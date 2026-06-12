import { z } from "zod";
import { Prisma } from "@prisma/client";

export const criarOSSchema = z.object({
  clienteId: z.string().uuid(),
  veiculoId: z.string().uuid(),
  descricao: z.string().max(2000).optional(),
  observacoes: z.string().max(2000).optional(),
  servicos: z.array(z.object({ servicoId: z.string().uuid() })).min(1),
  pecas: z
    .array(z.object({ pecaId: z.string().uuid(), quantidade: z.number().int().positive() }))
    .default([]),
});

export const atualizarOSSchema = z.object({
  descricao: z.string().max(2000).optional(),
  observacoes: z.string().max(2000).optional(),
});

export const adicionarItensSchema = z.object({
  servicos: z.array(z.object({ servicoId: z.string().uuid() })).default([]),
  pecas: z
    .array(z.object({ pecaId: z.string().uuid(), quantidade: z.number().int().positive() }))
    .default([]),
});

export const avancarStatusSchema = z.object({
  observacao: z.string().max(1000).optional(),
  tempoReal: z.number().int().positive().optional(),
});

export const reprovarOSSchema = z.object({
  observacao: z.string().max(1000).optional(),
});

export const cancelarOSSchema = z.object({
  motivo: z.string().min(1).max(500).optional(),
});

export const aprovarOrcamentoSchema = z.object({
  aprovado: z.boolean(),
  observacao: z.string().max(1000).optional(),
});

export const listarOSSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum([
      "RECEBIDA",
      "EM_DIAGNOSTICO",
      "AGUARDANDO_APROVACAO",
      "EM_EXECUCAO",
      "FINALIZADA",
      "ENTREGUE",
      "CANCELADA",
    ])
    .optional(),
  clienteId: z.string().uuid().optional(),
  veiculoId: z.string().uuid().optional(),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
});

export const paramsIdSchema = z.object({ id: z.string().uuid() });
export const numeroParamsSchema = z.object({ numero: z.coerce.number().int() });

export const consultaPublicaQuerySchema = z.object({
  numero: z.coerce.number().int().positive(),
  cpfCnpj: z.string(),
});

export const erroResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
});

const historicoOSItemSchema = z.object({
  id: z.string().uuid(),
  ordemId: z.string().uuid(),
  statusAnterior: z.string().nullable(),
  statusNovo: z.string(),
  observacao: z.string().nullable(),
  criadoEm: z.date(),
});

const itemServicoOSSchema = z.object({
  id: z.string().uuid(),
  ordemId: z.string().uuid(),
  servicoId: z.string().uuid(),
  preco: z.number() as z.ZodType<number | Prisma.Decimal>,
  tempoReal: z.number().int().nullable(),
  servico: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    descricao: z.string().nullish(),
    preco: z.number() as z.ZodType<number | Prisma.Decimal>,
    tempoPrevisto: z.number().int().nullable(),
    ativo: z.boolean(),
    criadoEm: z.date(),
    atualizadoEm: z.date(),
  }),
});

const itemPecaOSSchema = z.object({
  id: z.string().uuid(),
  ordemId: z.string().uuid(),
  pecaId: z.string().uuid(),
  quantidade: z.number().int(),
  preco: z.number() as z.ZodType<number | Prisma.Decimal>,
  peca: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    descricao: z.string().nullish(),
    preco: z.number() as z.ZodType<number | Prisma.Decimal>,
    quantidade: z.number().int(),
    estoqueMin: z.number().int(),
    unidade: z.string(),
    ativo: z.boolean(),
    criadoEm: z.date(),
    atualizadoEm: z.date(),
  }),
});

export const osResponseSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  clienteId: z.string().uuid(),
  veiculoId: z.string().uuid(),
  status: z.string(),
  descricao: z.string().nullable(),
  observacoes: z.string().nullable(),
  valorTotal: z.number() as z.ZodType<number | Prisma.Decimal>,
  aprovadoEm: z.date().nullable(),
  iniciadoEm: z.date().nullable(),
  finalizadoEm: z.date().nullable(),
  entregueEm: z.date().nullable(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
  cliente: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    cpfCnpj: z.string(),
    email: z.string().nullable(),
    telefone: z.string().nullable(),
  }),
  veiculo: z.object({
    id: z.string().uuid(),
    placa: z.string(),
    marca: z.string(),
    modelo: z.string(),
    ano: z.number().int(),
    cor: z.string().nullable(),
    clienteId: z.string().uuid(),
    ativo: z.boolean(),
    criadoEm: z.date(),
    atualizadoEm: z.date(),
  }),
  servicos: z.array(itemServicoOSSchema),
  pecas: z.array(itemPecaOSSchema),
  historico: z.array(historicoOSItemSchema),
});

const osListItemSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  clienteId: z.string().uuid(),
  veiculoId: z.string().uuid(),
  status: z.string(),
  descricao: z.string().nullable(),
  observacoes: z.string().nullable(),
  valorTotal: z.number() as z.ZodType<number | Prisma.Decimal>,
  aprovadoEm: z.date().nullable(),
  iniciadoEm: z.date().nullable(),
  finalizadoEm: z.date().nullable(),
  entregueEm: z.date().nullable(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
  cliente: z.object({ id: z.string().uuid(), nome: z.string(), cpfCnpj: z.string() }),
  veiculo: z.object({ id: z.string().uuid(), placa: z.string(), marca: z.string(), modelo: z.string() }),
  _count: z.object({ servicos: z.number().int(), pecas: z.number().int() }),
});

export const listarOSResponseSchema = z.object({
  data: z.array(osListItemSchema),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const consultaPublicaResponseSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  status: z.string(),
  statusLabel: z.string(),
  valorTotal: z.number() as z.ZodType<number | Prisma.Decimal>,
  criadoEm: z.date(),
  aprovadoEm: z.date().nullable(),
  iniciadoEm: z.date().nullable(),
  finalizadoEm: z.date().nullable(),
  entregueEm: z.date().nullable(),
  veiculo: z.object({ placa: z.string(), marca: z.string(), modelo: z.string() }),
  servicos: z.array(z.object({ servico: z.object({ nome: z.string() }), preco: z.number() as z.ZodType<number | Prisma.Decimal> })),
  historico: z.array(
    z.object({ statusNovo: z.string(), observacao: z.string().nullable(), criadoEm: z.date() }),
  ),
});

export type CriarOSInput = z.infer<typeof criarOSSchema>;
export type AtualizarOSInput = z.infer<typeof atualizarOSSchema>;
export type AdicionarItensInput = z.infer<typeof adicionarItensSchema>;
export type AvancarStatusInput = z.infer<typeof avancarStatusSchema>;
export type ListarOSInput = z.infer<typeof listarOSSchema>;
export type CancelarOSInput = z.infer<typeof cancelarOSSchema>;
export type AprovarOrcamentoInput = z.infer<typeof aprovarOrcamentoSchema>;
