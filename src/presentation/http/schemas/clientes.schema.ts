import { z } from "zod";
import { validarCPF, validarCNPJ, limparDocumento } from "../../../shared/utils/validators";

const cpfCnpjSchema = z
  .string()
  .transform(limparDocumento)
  .refine(
    (doc) => (doc.length === 11 ? validarCPF(doc) : doc.length === 14 ? validarCNPJ(doc) : false),
    { message: "CPF ou CNPJ inválido" },
  );

export const criarClienteSchema = z.object({
  nome: z.string().min(2).max(200),
  cpfCnpj: cpfCnpjSchema,
  email: z.string().email().optional(),
  telefone: z.string().max(20).optional(),
  endereco: z.string().max(500).optional(),
});

export const atualizarClienteSchema = criarClienteSchema.partial().omit({ cpfCnpj: true });

export const listarClientesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  busca: z.string().optional(),
});

export const paramsIdSchema = z.object({ id: z.string().uuid() });
export const documentoParamsSchema = z.object({ documento: z.string() });

export const clienteResponseSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  cpfCnpj: z.string(),
  tipoPessoa: z.enum(["FISICA", "JURIDICA"]),
  email: z.string().nullish(),
  telefone: z.string().nullish(),
  endereco: z.string().nullish(),
  ativo: z.boolean(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
});

export const listarClientesResponseSchema = z.object({
  data: z.array(clienteResponseSchema),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const erroResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
});

export type CriarClienteInput = z.infer<typeof criarClienteSchema>;
export type AtualizarClienteInput = z.infer<typeof atualizarClienteSchema>;
export type ListarClientesInput = z.infer<typeof listarClientesSchema>;
