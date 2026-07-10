import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaAuthRepository } from '../../../infrastructure/database/repositories/prisma-auth.repository';
import { FastifyTokenService } from '../../../infrastructure/services/fastify-token.service';
import { LoginUseCase } from '../../../application/use-cases/auth/login.use-case';
import { CriarUsuarioUseCase } from '../../../application/use-cases/auth/criar-usuario.use-case';
import { ListarUsuariosUseCase } from '../../../application/use-cases/auth/listar-usuarios.use-case';
import {
  loginSchema,
  criarUsuarioSchema,
  loginResponseSchema,
  usuarioResponseSchema,
  listarUsuariosResponseSchema,
  meResponseSchema,
  errorResponseSchema,
} from '../schemas/auth.schema';
import { autenticar, exigirRole } from '../middlewares/auth.middleware';

export const authRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const repo = new PrismaAuthRepository();
  const tokenService = new FastifyTokenService(instance);

  const login = new LoginUseCase(repo, tokenService);
  const criarUsuario = new CriarUsuarioUseCase(repo);
  const listarUsuarios = new ListarUsuariosUseCase(repo);

  fastify.post(
    '/login',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Login',
        body: loginSchema,
        response: { 200: loginResponseSchema, 401: errorResponseSchema },
      },
    },
    async (req, rep) => rep.send(await login.execute(req.body)),
  );

  fastify.post(
    '/usuarios',
    {
      onRequest: [exigirRole('ADMIN')],
      schema: {
        tags: ['Autenticação'],
        summary: 'Criar usuário (Admin)',
        security: [{ bearerAuth: [] }],
        body: criarUsuarioSchema,
        response: { 201: usuarioResponseSchema },
      },
    },
    async (req, rep) => rep.status(201).send(await criarUsuario.execute(req.body)),
  );

  fastify.get(
    '/usuarios',
    {
      onRequest: [exigirRole('ADMIN')],
      schema: {
        tags: ['Autenticação'],
        summary: 'Listar usuários (Admin)',
        security: [{ bearerAuth: [] }],
        response: { 200: listarUsuariosResponseSchema },
      },
    },
    async (_req, rep) => rep.send(await listarUsuarios.execute()),
  );

  fastify.get(
    '/me',
    {
      onRequest: [autenticar],
      schema: {
        tags: ['Autenticação'],
        summary: 'Dados do usuário logado',
        security: [{ bearerAuth: [] }],
        response: { 200: meResponseSchema },
      },
    },
    async (req, rep) => rep.send(req.user as { sub: string; email: string; role: string }),
  );
};
