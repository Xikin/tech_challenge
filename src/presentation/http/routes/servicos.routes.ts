import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaServicoRepository } from '../../../infrastructure/database/repositories/prisma-servicos.repository';
import { CriarServicoUseCase } from '../../../application/use-cases/servicos/criar-servico.use-case';
import { ListarServicosUseCase } from '../../../application/use-cases/servicos/listar-servicos.use-case';
import { BuscarServicoPorIdUseCase } from '../../../application/use-cases/servicos/buscar-servico-por-id.use-case';
import { CalcularTempoMedioUseCase } from '../../../application/use-cases/servicos/calcular-tempo-medio.use-case';
import { AtualizarServicoUseCase } from '../../../application/use-cases/servicos/atualizar-servico.use-case';
import { RemoverServicoUseCase } from '../../../application/use-cases/servicos/remover-servico.use-case';
import {
  criarServicoSchema,
  atualizarServicoSchema,
  listarServicosSchema,
  paramsIdSchema,
  erroResponseSchema,
  tempoMedioResponseSchema,
  servicoResponseSchema,
  listarServicosResponseSchema,
} from '../schemas/servicos.schema';
import { exigirInterno } from '../middlewares/auth.middleware';

export const servicosRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const repo = new PrismaServicoRepository();
  const tags = ['Serviços'];
  const security = [{ bearerAuth: [] }];

  const criar = new CriarServicoUseCase(repo);
  const listar = new ListarServicosUseCase(repo);
  const buscarPorId = new BuscarServicoPorIdUseCase(repo);
  const calcularTempoMedio = new CalcularTempoMedioUseCase(repo);
  const atualizar = new AtualizarServicoUseCase(repo);
  const remover = new RemoverServicoUseCase(repo);

  fastify.post(
    '/',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Criar serviço',
        body: criarServicoSchema,
        response: { 201: servicoResponseSchema, 401: erroResponseSchema, 409: erroResponseSchema },
      },
    },
    async (req, rep) => rep.status(201).send(await criar.execute(req.body)),
  );

  fastify.get(
    '/',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Listar serviços',
        querystring: listarServicosSchema,
        response: { 200: listarServicosResponseSchema },
      },
    },
    async (req, rep) => rep.send(await listar.execute(req.query)),
  );

  fastify.get(
    '/:id',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Buscar serviço por ID',
        params: paramsIdSchema,
        response: { 200: servicoResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await buscarPorId.execute(req.params.id)),
  );

  fastify.get(
    '/:id/tempo-medio',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Tempo médio de execução',
        params: paramsIdSchema,
        response: { 200: tempoMedioResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await calcularTempoMedio.execute(req.params.id)),
  );

  fastify.put(
    '/:id',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Atualizar serviço',
        params: paramsIdSchema,
        body: atualizarServicoSchema,
        response: { 200: servicoResponseSchema, 404: erroResponseSchema, 409: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await atualizar.execute(req.params.id, req.body)),
  );

  fastify.delete(
    '/:id',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Remover serviço',
        params: paramsIdSchema,
        response: { 404: erroResponseSchema, 400: erroResponseSchema },
      },
    },
    async (req, rep) => {
      await remover.execute(req.params.id);
      return rep.status(204).send();
    },
  );
};
