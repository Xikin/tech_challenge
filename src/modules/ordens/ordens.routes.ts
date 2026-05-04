import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { OrdensRepository } from "./ordens.repository";
import { OrdensService } from "./ordens.service";
import {
  criarOSSchema,
  atualizarOSSchema,
  adicionarItensSchema,
  avancarStatusSchema,
  reprovarOSSchema,
  cancelarOSSchema,
  listarOSSchema,
  paramsIdSchema,
  numeroParamsSchema,
  consultaPublicaQuerySchema,
  erroResponseSchema,
  osResponseSchema,
  listarOSResponseSchema,
  consultaPublicaResponseSchema,
} from "./ordens.schema";
import { autenticar } from "../../shared/middlewares/auth";

export const ordensRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const service = new OrdensService(new OrdensRepository());
  const tags = ["Ordens de Serviço"];
  const security = [{ bearerAuth: [] }];

  fastify.get(
    "/consulta-publica",
    {
      schema: {
        tags,
        summary: "Consultar status da OS (sem login)",
        description: "Cliente informa número da OS e CPF/CNPJ para acompanhar sem autenticação.",
        querystring: consultaPublicaQuerySchema,
        response: {
          200: consultaPublicaResponseSchema,
          404: erroResponseSchema,
          400: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.consultarStatusPublico(req.query.numero, req.query.cpfCnpj));
    },
  );

  fastify.post(
    "/",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Criar OS",
        body: criarOSSchema,
        response: {
          201: osResponseSchema,
          404: erroResponseSchema,
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
        summary: "Listar OS",
        querystring: listarOSSchema,
        response: { 200: listarOSResponseSchema, 401: erroResponseSchema },
      },
    },
    async (req, rep) => {
      return rep.send(await service.listar(req.query));
    },
  );

  fastify.get(
    "/numero/:numero",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Buscar OS por número",
        params: numeroParamsSchema,
        response: {
          200: osResponseSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.buscarPorNumero(req.params.numero));
    },
  );

  fastify.get(
    "/:id",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Buscar OS por ID",
        params: paramsIdSchema,
        response: {
          200: osResponseSchema,
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
        summary: "Atualizar OS",
        params: paramsIdSchema,
        body: atualizarOSSchema,
        response: {
          200: osResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.atualizar(req.params.id, req.body));
    },
  );

  fastify.post(
    "/:id/itens",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Adicionar itens à OS",
        description: "Permitido apenas para OS Recebida, Em Diagnóstico ou Aguardando Aprovação.",
        params: paramsIdSchema,
        body: adicionarItensSchema,
        response: {
          200: osResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.adicionarItens(req.params.id, req.body));
    },
  );

  fastify.patch(
    "/:id/avancar",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Avançar status da OS",
        description:
          "Recebida → Em Diagnóstico → Aguardando Aprovação → Em Execução → Finalizada → Entregue",
        params: paramsIdSchema,
        body: avancarStatusSchema,
        response: {
          200: osResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.avancarStatus(req.params.id, req.body));
    },
  );

  fastify.patch(
    "/:id/reprovar",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Reprovar orçamento",
        description: "Retorna OS para Em Diagnóstico e devolve as peças ao estoque.",
        params: paramsIdSchema,
        body: reprovarOSSchema,
        response: {
          200: osResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.reprovarOS(req.params.id, req.body.observacao));
    },
  );

  fastify.patch(
    "/:id/cancelar",
    {
      onRequest: [autenticar],
      schema: {
        tags,
        security,
        summary: "Cancelar OS",
        description:
          "Cancela a OS e devolve as peças ao estoque. Permitido para: Recebida, Em Diagnóstico, Aguardando Aprovação e Em Execução.",
        params: paramsIdSchema,
        body: cancelarOSSchema,
        response: {
          200: osResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      return rep.send(await service.cancelarOS(req.params.id, req.body.motivo));
    },
  );
};
