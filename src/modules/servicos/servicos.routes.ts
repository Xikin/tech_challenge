import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { ServicosRepository } from "./servicos.repository";
import { ServicosService } from "./servicos.service";
import {
  criarServicoSchema,
  atualizarServicoSchema,
  listarServicosSchema,
  paramsIdSchema,
  erroResponseSchema,
  tempoMedioResponseSchema,
  servicoResponseSchema,
  listarServicosResponseSchema,
} from "./servicos.schema";
import { autenticar } from "../../shared/middlewares/auth";

export const servicosRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const service = new ServicosService(new ServicosRepository());
  const tags = ["Serviços"];
  const security = [{ bearerAuth: [] }];

  fastify.post(
    "/",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Criar serviço",
        body: criarServicoSchema,
        response: {
          201: servicoResponseSchema,
          401: erroResponseSchema,
          409: erroResponseSchema,
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
        summary: "Listar serviços",
        querystring: listarServicosSchema,
        response: { 200: listarServicosResponseSchema },
      },
    },
    async (req, rep) => {
      return rep.send(await service.listar(req.query));
    },
  );

  fastify.get(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Buscar serviço por ID",
        params: paramsIdSchema,
        response: {
          200: servicoResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.buscarPorId(req.params.id));
    },
  );

  fastify.get(
    "/:id/tempo-medio",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Tempo médio de execução",
        params: paramsIdSchema,
        response: {
          200: tempoMedioResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.calcularTempoMedio(req.params.id));
    },
  );

  fastify.put(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Atualizar serviço",
        params: paramsIdSchema,
        body: atualizarServicoSchema,
        response: {
          200: servicoResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
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
        summary: "Remover serviço",
        params: paramsIdSchema,
        response: {
          404: erroResponseSchema,
          400: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      await service.remover(req.params.id);
      return rep.status(204).send();
    },
  );
};
