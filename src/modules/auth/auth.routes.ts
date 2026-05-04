import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import {
  loginSchema,
  criarUsuarioSchema,
  loginResponseSchema,
  usuarioResponseSchema,
  listarUsuariosResponseSchema,
  meResponseSchema,
  errorResponseSchema,
} from "./auth.schema";
import { autenticar, exigirRole } from "../../shared/middlewares/auth";

export const authRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const service = new AuthService(new AuthRepository(), instance);

  fastify.post(
    "/login",
    {
      schema: {
        tags: ["Autenticação"],
        summary: "Login",
        body: loginSchema,
        response: {
          200: loginResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (req, rep) => {
      const result = await service.login(req.body);
      return rep.send(result);
    },
  );

  fastify.post(
    "/usuarios",
    {
      onRequest: [exigirRole("ADMIN")],
      schema: {
        tags: ["Autenticação"],
        summary: "Criar usuário (Admin)",
        security: [{ bearerAuth: [] }],
        body: criarUsuarioSchema,
        response: { 201: usuarioResponseSchema },
      },
    },
    async (req, rep) => {
      return rep.status(201).send(await service.criarUsuario(req.body));
    },
  );

  fastify.get(
    "/usuarios",
    {
      onRequest: [exigirRole("ADMIN")],
      schema: {
        tags: ["Autenticação"],
        summary: "Listar usuários (Admin)",
        security: [{ bearerAuth: [] }],
        response: { 200: listarUsuariosResponseSchema },
      },
    },
    async (_req, rep) => {
      return rep.send(await service.listarUsuarios());
    },
  );

  fastify.get(
    "/me",
    {
      onRequest: [autenticar],
      schema: {
        tags: ["Autenticação"],
        summary: "Dados do usuário logado",
        security: [{ bearerAuth: [] }],
        response: { 200: meResponseSchema },
      },
    },
    async (req, rep) => {
      return rep.send(req.user as { sub: string; email: string; role: string });
    },
  );
};
