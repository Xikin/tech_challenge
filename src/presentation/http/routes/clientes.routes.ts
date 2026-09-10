import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaClienteRepository } from '../../../infrastructure/database/repositories/prisma-clientes.repository';
import { CriarClienteUseCase } from '../../../application/use-cases/clientes/criar-cliente.use-case';
import { ListarClientesUseCase } from '../../../application/use-cases/clientes/listar-clientes.use-case';
import { BuscarClientePorIdUseCase } from '../../../application/use-cases/clientes/buscar-cliente-por-id.use-case';
import { BuscarClientePorDocumentoUseCase } from '../../../application/use-cases/clientes/buscar-cliente-por-documento.use-case';
import { AtualizarClienteUseCase } from '../../../application/use-cases/clientes/atualizar-cliente.use-case';
import { RemoverClienteUseCase } from '../../../application/use-cases/clientes/remover-cliente.use-case';
import {
  criarClienteSchema,
  atualizarClienteSchema,
  listarClientesSchema,
  paramsIdSchema,
  documentoParamsSchema,
  clienteResponseSchema,
  listarClientesResponseSchema,
  erroResponseSchema,
} from '../schemas/clientes.schema';
import { exigirInterno, exigirDonoDoRecurso } from '../middlewares/auth.middleware';

export const clientesRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const repo = new PrismaClienteRepository();
  const tags = ['Clientes'];
  const security = [{ bearerAuth: [] }];

  const criar = new CriarClienteUseCase(repo);
  const listar = new ListarClientesUseCase(repo);
  const buscarPorId = new BuscarClientePorIdUseCase(repo);
  const buscarPorDocumento = new BuscarClientePorDocumentoUseCase(repo);
  const atualizar = new AtualizarClienteUseCase(repo);
  const remover = new RemoverClienteUseCase(repo);

  fastify.post(
    '/',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Criar cliente',
        body: criarClienteSchema,
        response: { 201: clienteResponseSchema, 409: erroResponseSchema, 422: erroResponseSchema },
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
        summary: 'Listar clientes',
        querystring: listarClientesSchema,
        response: { 200: listarClientesResponseSchema },
      },
    },
    async (req, rep) => rep.send(await listar.execute(req.query)),
  );

  fastify.get(
    '/cpf-cnpj/:documento',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Buscar por CPF/CNPJ',
        params: documentoParamsSchema,
        response: { 200: clienteResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) =>
      rep.send(await buscarPorDocumento.execute(req.params.documento.replace(/\D/g, ''))),
  );

  fastify.get(
    '/:id',
    {
      // O próprio cliente pode consultar o seu cadastro: o `sub` do token
      // emitido pela Lambda de autenticação É o id do cliente.
      onRequest: [exigirDonoDoRecurso(async (req) => (req.params as { id: string }).id)],
      schema: {
        tags,
        security,
        summary: 'Buscar por ID',
        params: paramsIdSchema,
        response: { 200: clienteResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await buscarPorId.execute(req.params.id)),
  );

  fastify.put(
    '/:id',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Atualizar cliente',
        params: paramsIdSchema,
        body: atualizarClienteSchema,
        response: { 200: clienteResponseSchema, 404: erroResponseSchema },
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
        summary: 'Remover cliente (soft delete)',
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
