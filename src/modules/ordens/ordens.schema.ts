import { z } from "zod";

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

export type CriarOSInput = z.infer<typeof criarOSSchema>;
export type AtualizarOSInput = z.infer<typeof atualizarOSSchema>;
export type AdicionarItensInput = z.infer<typeof adicionarItensSchema>;
export type AvancarStatusInput = z.infer<typeof avancarStatusSchema>;
export type ListarOSInput = z.infer<typeof listarOSSchema>;
export type CancelarOSInput = z.infer<typeof cancelarOSSchema>;
