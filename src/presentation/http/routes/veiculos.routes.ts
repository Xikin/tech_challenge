import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrismaVeiculoRepository } from '../../../infrastructure/database/repositories/prisma-veiculos.repository';
import type { CriarVeiculoData } from '../../../domain/repositories/veiculos.repository.interface';
import { CriarVeiculoUseCase } from '../../../application/use-cases/veiculos/criar-veiculo.use-case';
import { ListarVeiculosUseCase } from '../../../application/use-cases/veiculos/listar-veiculos.use-case';
import { BuscarVeiculoPorIdUseCase } from '../../../application/use-cases/veiculos/buscar-veiculo-por-id.use-case';
import { BuscarVeiculoPorPlacaUseCase } from '../../../application/use-cases/veiculos/buscar-veiculo-por-placa.use-case';
import { AtualizarVeiculoUseCase } from '../../../application/use-cases/veiculos/atualizar-veiculo.use-case';
import { RemoverVeiculoUseCase } from '../../../application/use-cases/veiculos/remover-veiculo.use-case';
import {
  criarVeiculoSchema,
  atualizarVeiculoSchema,
  listarVeiculosQuerySchema,
  paramsIdSchema,
  placaParamsSchema,
  veiculoResponseSchema,
  erroResponseSchema,
} from '../schemas/veiculos.schema';
import { autenticar } from '../middlewares/auth.middleware';

export const veiculosRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const repo = new PrismaVeiculoRepository();
  const tags = ['Veículos'];
  const security = [{ bearerAuth: [] }];

  const criar = new CriarVeiculoUseCase(repo);
  const listar = new ListarVeiculosUseCase(repo);
  const buscarPorId = new BuscarVeiculoPorIdUseCase(repo);
  const buscarPorPlaca = new BuscarVeiculoPorPlacaUseCase(repo);
  const atualizar = new AtualizarVeiculoUseCase(repo);
  const remover = new RemoverVeiculoUseCase(repo);

  fastify.post(
    '/',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Cadastrar veículo',
        body: criarVeiculoSchema,
        response: {
          201: veiculoResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, rep) => rep.status(201).send(await criar.execute(req.body as CriarVeiculoData)),
  );

  fastify.get(
    '/',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Listar veículos',
        querystring: listarVeiculosQuerySchema,
        response: { 200: z.array(veiculoResponseSchema) },
      },
    },
    async (req, rep) => rep.send(await listar.execute(req.query.clienteId)),
  );

  fastify.get(
    '/placa/:placa',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Buscar por placa',
        params: placaParamsSchema,
        response: { 200: veiculoResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await buscarPorPlaca.execute(req.params.placa)),
  );

  fastify.get(
    '/:id',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Buscar por ID',
        params: paramsIdSchema,
        response: { 200: veiculoResponseSchema, 404: erroResponseSchema },
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
        summary: 'Atualizar veículo',
        params: paramsIdSchema,
        body: atualizarVeiculoSchema,
        response: { 200: veiculoResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await atualizar.execute(req.params.id, req.body)),
  );

  fastify.delete(
    '/:id',
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: 'Remover veículo',
        params: paramsIdSchema,
        response: { 404: erroResponseSchema },
      },
    },
    async (req, rep) => {
      await remover.execute(req.params.id);
      return rep.status(204).send();
    },
  );
};
