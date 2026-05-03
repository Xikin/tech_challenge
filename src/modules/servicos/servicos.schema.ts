import { z } from "zod";

export const criarServicoSchema = z.object({
  nome: z.string().min(2).max(200),
  descricao: z.string().max(1000).optional(),
  preco: z.number().positive(),
  tempoPrevisto: z.number().int().positive().optional(),
});

export const atualizarServicoSchema = criarServicoSchema.partial();

export const listarServicosSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  busca: z.string().optional(),
});

export const paramsIdSchema = z.object({ id: z.string().uuid() });

export const erroResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
});

export const tempoMedioResponseSchema = z.object({
  tempoMedio: z.number().int().nullable(),
  totalExecucoes: z.number().int(),
});

export type CriarServicoInput = z.infer<typeof criarServicoSchema>;
export type AtualizarServicoInput = z.infer<typeof atualizarServicoSchema>;
export type ListarServicosInput = z.infer<typeof listarServicosSchema>;
