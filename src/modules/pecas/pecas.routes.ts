import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PecasRepository } from "./pecas.repository";
import { PecasService } from "./pecas.service";
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
} from "./pecas.schema";
import { autenticar } from "../../shared/middlewares/auth";

export const pecasRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const service = new PecasService(new PecasRepository());
  const tags = ["Peças e Insumos"];
  const security = [{ bearerAuth: [] }];

  fastify.post(
    "/",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Cadastrar peça",
        body: criarPecaSchema,
        response: {
          201: pecaResponseSchema,
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
        summary: "Listar peças",
        querystring: listarPecasSchema,
        response: {
          200: listarPecasResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.listar(req.query));
    },
  );

  fastify.get(
    "/alertas-estoque",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Peças com estoque abaixo do mínimo",
        response: {
          200: z.array(alertaEstoqueItemSchema),
          401: erroResponseSchema,
        },
      },
    },
    async (_req, rep) => {
      return rep.send(await service.alertasEstoque());
    },
  );

  fastify.get(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Buscar peça por ID",
        params: paramsIdSchema,
        response: {
          200: pecaResponseSchema,
          401: erroResponseSchema,
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
        summary: "Atualizar peça",
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
    async (req, rep) => {
      return rep.send(await service.atualizar(req.params.id, req.body));
    },
  );

  fastify.patch(
    "/:id/estoque",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Ajustar estoque",
        description: "Use valor **positivo** para entrada e **negativo** para saída.",
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
    async (req, rep) => {
      return rep.send(await service.ajustarEstoque(req.params.id, req.body));
    },
  );

  fastify.delete(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Remover peça",
        params: paramsIdSchema,
        response: {
          204: z.void(),
          401: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      await service.remover(req.params.id);
      return rep.status(204).send();
    },
  );
};
