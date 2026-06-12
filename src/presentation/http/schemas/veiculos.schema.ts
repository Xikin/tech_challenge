import { z } from "zod";
import { validarPlaca, limparPlaca } from "../../../shared/utils/validators";

export const criarVeiculoSchema = z.object({
  clienteId: z.string().uuid(),
  placa: z.string().transform(limparPlaca).refine(validarPlaca, { message: "Placa inválida" }),
  marca: z.string().min(1).max(100),
  modelo: z.string().min(1).max(100),
  ano: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1),
  cor: z.string().max(50).optional(),
});

export const atualizarVeiculoSchema = criarVeiculoSchema
  .partial()
  .omit({ clienteId: true, placa: true });

export const listarVeiculosQuerySchema = z.object({
  clienteId: z.string().uuid().optional(),
});

export const paramsIdSchema = z.object({ id: z.string().uuid() });
export const placaParamsSchema = z.object({ placa: z.string() });

export const veiculoResponseSchema = z.object({
  id: z.string().uuid(),
  placa: z.string(),
  marca: z.string(),
  modelo: z.string(),
  ano: z.number().int(),
  cor: z.string().nullable(),
  ativo: z.boolean(),
  clienteId: z.string().uuid(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
});

export const erroResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
});

export type CriarVeiculoInput = z.infer<typeof criarVeiculoSchema>;
export type AtualizarVeiculoInput = z.infer<typeof atualizarVeiculoSchema>;
