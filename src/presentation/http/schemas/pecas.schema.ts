import { z } from 'zod';

export const criarPecaSchema = z.object({
  nome: z.string().min(2).max(200),
  descricao: z.string().max(1000).optional(),
  preco: z.number().positive(),
  quantidade: z.number().int().min(0).default(0),
  estoqueMin: z.number().int().min(0).default(0),
  unidade: z.string().max(10).default('un'),
});

export const atualizarPecaSchema = criarPecaSchema.partial();

export const ajustarEstoqueSchema = z.object({
  quantidade: z.number().int(),
  motivo: z.string().optional(),
});

export const listarPecasSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  busca: z.string().optional(),
  apenasEstoqueBaixo: z.coerce.boolean().default(false),
});

export const paramsIdSchema = z.object({ id: z.string().uuid() });

export const erroResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
});

export const alertaEstoqueItemSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  quantidade: z.number().int(),
  estoqueMin: z.number().int(),
  unidade: z.string(),
  deficit: z.number().int(),
});

export const pecaResponseSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  descricao: z.string().nullish(),
  preco: z.number(),
  quantidade: z.number().int(),
  estoqueMin: z.number().int(),
  unidade: z.string(),
  ativo: z.boolean(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
});

export const pecaComAlertaSchema = pecaResponseSchema.extend({
  estoqueBaixo: z.boolean(),
});

export const listarPecasResponseSchema = z.object({
  data: z.array(pecaComAlertaSchema),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type CriarPecaInput = z.infer<typeof criarPecaSchema>;
export type AtualizarPecaInput = z.infer<typeof atualizarPecaSchema>;
export type AjustarEstoqueInput = z.infer<typeof ajustarEstoqueSchema>;
export type ListarPecasInput = z.infer<typeof listarPecasSchema>;
