import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export const criarUsuarioSchema = z.object({
  nome: z.string().min(2).max(200),
  email: z.string().email(),
  senha: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Deve ter ao menos uma letra maiúscula")
    .regex(/[0-9]/, "Deve ter ao menos um número")
    .regex(/[@$!%*?&]/, "Deve ter ao menos um caractere especial"),
  role: z.enum(["ADMIN", "FUNCIONARIO"]).default("FUNCIONARIO"),
});

export const loginResponseSchema = z.object({
  token: z.string(),
  usuario: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    email: z.string(),
    role: z.enum(["ADMIN", "FUNCIONARIO"]),
  }),
});

export const usuarioResponseSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  role: z.string(),
  criadoEm: z.date(),
});

export const listarUsuariosResponseSchema = z.array(
  z.object({
    id: z.string().uuid(),
    nome: z.string(),
    email: z.string(),
    role: z.enum(["ADMIN", "FUNCIONARIO"]),
    ativo: z.boolean(),
    criadoEm: z.date(),
  }),
);

export const meResponseSchema = z.object({
  sub: z.string().uuid(),
  email: z.string(),
  role: z.string(),
});

export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
