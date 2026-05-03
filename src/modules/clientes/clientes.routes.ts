import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { ClientesRepository } from "./clientes.repository";
import { ClientesService } from "./clientes.service";
import {
  criarClienteSchema,
  atualizarClienteSchema,
  listarClientesSchema,
  paramsIdSchema,
  documentoParamsSchema,
  clienteResponseSchema,
  listarClientesResponseSchema,
  erroResponseSchema,
} from "./clientes.schema";
import { autenticar } from "../../shared/middlewares/auth";

export const clientesRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const service = new ClientesService(new ClientesRepository());
  const tags = ["Clientes"];
  const security = [{ bearerAuth: [] }];

  fastify.post(
    "/",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Criar cliente",
        body: criarClienteSchema,
        response: { 201: clienteResponseSchema, 409: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => {
      return rep.status(201).send(await service.criar(req.body));
    },
  );

  fastify.get(
    "/",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Listar clientes",
        querystring: listarClientesSchema,
        response: { 200: listarClientesResponseSchema },
      },
    },
    async (req, rep) => {
      return rep.send(await service.listar(req.query));
    },
  );

  fastify.get(
    "/cpf-cnpj/:documento",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Buscar por CPF/CNPJ",
        params: documentoParamsSchema,
        response: { 200: clienteResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => {
      return rep.send(await service.buscarPorCpfCnpj(req.params.documento.replace(/\D/g, "")));
    },
  );

  fastify.get(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Buscar por ID",
        params: paramsIdSchema,
        response: {
          200: clienteResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.buscarPorId(req.params.id));
    },
  );

  fastify.put(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Atualizar cliente",
        params: paramsIdSchema,
        body: atualizarClienteSchema,
        response: {
          200: clienteResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.atualizar(req.params.id, req.body));
    },
  );

  fastify.delete(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Remover cliente (soft delete)",
        params: paramsIdSchema,
        response: { 404: erroResponseSchema },
      },
    },
    async (req, rep) => {
      await service.remover(req.params.id);
      return rep.status(204).send();
    },
  );
};
