import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrismaPecaRepository } from '../../../infrastructure/database/repositories/prisma-pecas.repository';
import { CriarPecaUseCase } from '../../../application/use-cases/pecas/criar-peca.use-case';
import { ListarPecasUseCase } from '../../../application/use-cases/pecas/listar-pecas.use-case';
import { BuscarPecaPorIdUseCase } from '../../../application/use-cases/pecas/buscar-peca-por-id.use-case';
import { AlertasEstoqueUseCase } from '../../../application/use-cases/pecas/alertas-estoque.use-case';
import { AtualizarPecaUseCase } from '../../../application/use-cases/pecas/atualizar-peca.use-case';
import { AjustarEstoqueUseCase } from '../../../application/use-cases/pecas/ajustar-estoque.use-case';
import { RemoverPecaUseCase } from '../../../application/use-cases/pecas/remover-peca.use-case';
import {
  criarPecaSchema,
  atualizarPecaSchema,
  ajustarEstoqueSchema,
  listarPecasSchema,
  paramsIdSchema,
  erroResponseSchema,
  alertaEstoqueItemSchema,
  pecaResponseSchema,
  listarPecasResponseSchema,
} from '../schemas/pecas.schema';
import { autenticar } from '../middlewares/auth.middleware';

export const pecasRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const repo = new PrismaPecaRepository();
  const tags = ['Peças e Insumos'];
  const security = [{ bearerAuth: [] }];

  const criar = new CriarPecaUseCase(repo);
  const listar = new ListarPecasUseCase(repo);
  const buscarPorId = new BuscarPecaPorIdUseCase(repo);
  const alertasEstoque = new AlertasEstoqueUseCase(repo);
  const atualizar = new AtualizarPecaUseCase(repo);
  const ajustarEstoque = new AjustarEstoqueUseCase(repo);
  const remover = new RemoverPecaUseCase(repo);

  fastify.post(
    '/',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Cadastrar peça',
        body: criarPecaSchema,
        response: { 201: pecaResponseSchema, 401: erroResponseSchema, 409: erroResponseSchema },
      },
    },
    async (req, rep) => rep.status(201).send(await criar.execute(req.body)),
  );

  fastify.get(
    '/',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Listar peças',
        querystring: listarPecasSchema,
        response: { 200: listarPecasResponseSchema, 401: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await listar.execute(req.query)),
  );

  fastify.get(
    '/alertas-estoque',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Peças com estoque abaixo do mínimo',
        response: { 200: z.array(alertaEstoqueItemSchema), 401: erroResponseSchema },
      },
    },
    async (_req, rep) => rep.send(await alertasEstoque.execute()),
  );

  fastify.get(
    '/:id',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Buscar peça por ID',
        params: paramsIdSchema,
        response: { 200: pecaResponseSchema, 401: erroResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await buscarPorId.execute(req.params.id)),
  );

  fastify.put(
    '/:id',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Atualizar peça',
        params: paramsIdSchema,
        body: atualizarPecaSchema,
        response: {
          200: pecaResponseSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, rep) => rep.send(await atualizar.execute(req.params.id, req.body)),
  );

  fastify.patch(
    '/:id/estoque',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Ajustar estoque',
        description: 'Use valor **positivo** para entrada e **negativo** para saída.',
        params: paramsIdSchema,
        body: ajustarEstoqueSchema,
        response: {
          200: pecaResponseSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => rep.send(await ajustarEstoque.execute(req.params.id, req.body)),
  );

  fastify.delete(
    '/:id',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Remover peça',
        params: paramsIdSchema,
        response: { 204: z.void(), 401: erroResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => {
      await remover.execute(req.params.id);
      return rep.status(204).send();
    },
  );
};
