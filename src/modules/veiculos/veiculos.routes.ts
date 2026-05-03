import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { VeiculosRepository } from "./veiculos.repository";
import { VeiculosService } from "./veiculos.service";
import {
  criarVeiculoSchema,
  atualizarVeiculoSchema,
  listarVeiculosQuerySchema,
  paramsIdSchema,
  placaParamsSchema,
  veiculoResponseSchema,
  erroResponseSchema,
} from "./veiculos.schema";
import { autenticar } from "../../shared/middlewares/auth";

export const veiculosRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const service = new VeiculosService(new VeiculosRepository());
  const tags = ["Veículos"];
  const security = [{ bearerAuth: [] }];

  fastify.post(
    "/",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Cadastrar veículo",
        body: criarVeiculoSchema,
        response: {
          201: veiculoResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
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
        summary: "Listar veículos",
        querystring: listarVeiculosQuerySchema,
        response: { 200: z.array(veiculoResponseSchema) },
      },
    },
    async (req, rep) => {
      return rep.send(await service.listar(req.query.clienteId));
    },
  );

  fastify.get(
    "/placa/:placa",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Buscar por placa",
        params: placaParamsSchema,
        response: {
          200: veiculoResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.buscarPorPlaca(req.params.placa));
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
          200: veiculoResponseSchema,
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
        summary: "Atualizar veículo",
        params: paramsIdSchema,
        body: atualizarVeiculoSchema,
        response: {
          200: veiculoResponseSchema,
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
        summary: "Remover veículo",
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
