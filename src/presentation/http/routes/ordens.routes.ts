import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PrismaOrdemRepository } from "../../../infrastructure/database/repositories/prisma-ordens.repository";
import { NodemailerEmailService } from "../../../infrastructure/services/nodemailer-email.service";
import { CriarOrdemUseCase } from "../../../application/use-cases/ordens/criar-ordem.use-case";
import { ListarOrdensUseCase } from "../../../application/use-cases/ordens/listar-ordens.use-case";
import { BuscarOrdemPorIdUseCase } from "../../../application/use-cases/ordens/buscar-ordem-por-id.use-case";
import { BuscarOrdemPorNumeroUseCase } from "../../../application/use-cases/ordens/buscar-ordem-por-numero.use-case";
import { ConsultarStatusPublicoUseCase } from "../../../application/use-cases/ordens/consultar-status-publico.use-case";
import { AtualizarOrdemUseCase } from "../../../application/use-cases/ordens/atualizar-ordem.use-case";
import { AdicionarItensUseCase } from "../../../application/use-cases/ordens/adicionar-itens.use-case";
import { AvancarStatusUseCase } from "../../../application/use-cases/ordens/avancar-status.use-case";
import { AprovarOrcamentoUseCase } from "../../../application/use-cases/ordens/aprovar-orcamento.use-case";
import { ReprovarOrcamentoUseCase } from "../../../application/use-cases/ordens/reprovar-orcamento.use-case";
import { CancelarOrdemUseCase } from "../../../application/use-cases/ordens/cancelar-ordem.use-case";
import {
  criarOSSchema, atualizarOSSchema, adicionarItensSchema, avancarStatusSchema,
  reprovarOSSchema, cancelarOSSchema, aprovarOrcamentoSchema, listarOSSchema,
  paramsIdSchema, numeroParamsSchema, consultaPublicaQuerySchema,
  erroResponseSchema, osResponseSchema, listarOSResponseSchema, consultaPublicaResponseSchema,
} from "../schemas/ordens.schema";
import { autenticar } from "../middlewares/auth.middleware";

export const ordensRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const repo = new PrismaOrdemRepository();
  const emailService = new NodemailerEmailService();
  const tags = ["Ordens de Serviço"];
  const security = [{ bearerAuth: [] }];

  const consultarPublico = new ConsultarStatusPublicoUseCase(repo);
  const criar = new CriarOrdemUseCase(repo);
  const listar = new ListarOrdensUseCase(repo);
  const buscarPorNumero = new BuscarOrdemPorNumeroUseCase(repo);
  const buscarPorId = new BuscarOrdemPorIdUseCase(repo);
  const atualizar = new AtualizarOrdemUseCase(repo);
  const adicionarItens = new AdicionarItensUseCase(repo);
  const avancarStatus = new AvancarStatusUseCase(repo, emailService);
  const aprovarOrcamento = new AprovarOrcamentoUseCase(repo, emailService);
  const reprovarOrcamento = new ReprovarOrcamentoUseCase(repo);
  const cancelar = new CancelarOrdemUseCase(repo);

  fastify.get("/consulta-publica", {
    schema: { tags, summary: "Consultar status da OS (sem login)", description: "Cliente informa número da OS e CPF/CNPJ para acompanhar sem autenticação.", querystring: consultaPublicaQuerySchema, response: { 200: consultaPublicaResponseSchema, 404: erroResponseSchema, 400: erroResponseSchema } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, async (req, rep) => rep.send(await consultarPublico.execute(req.query.numero, req.query.cpfCnpj) as any));

  fastify.post("/", { onRequest: [autenticar], schema: { tags, security, summary: "Criar OS", body: criarOSSchema, response: { 201: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.status(201).send(await criar.execute(req.body) as any));

  fastify.get("/", { onRequest: [autenticar], schema: { tags, security, summary: "Listar OS", querystring: listarOSSchema, response: { 200: listarOSResponseSchema, 401: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await listar.execute(req.query) as any));

  fastify.get("/numero/:numero", { onRequest: [autenticar], schema: { tags, security, summary: "Buscar OS por número", params: numeroParamsSchema, response: { 200: osResponseSchema, 401: erroResponseSchema, 404: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await buscarPorNumero.execute(req.params.numero) as any));

  fastify.get("/:id", { onRequest: [autenticar], schema: { tags, security, summary: "Buscar OS por ID", params: paramsIdSchema, response: { 200: osResponseSchema, 401: erroResponseSchema, 404: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await buscarPorId.execute(req.params.id) as any));

  fastify.put("/:id", { onRequest: [autenticar], schema: { tags, security, summary: "Atualizar OS", params: paramsIdSchema, body: atualizarOSSchema, response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await atualizar.execute(req.params.id, req.body) as any));

  fastify.post("/:id/itens", { onRequest: [autenticar], schema: { tags, security, summary: "Adicionar itens à OS", description: "Permitido apenas para OS Recebida, Em Diagnóstico ou Aguardando Aprovação.", params: paramsIdSchema, body: adicionarItensSchema, response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await adicionarItens.execute(req.params.id, req.body) as any));

  fastify.patch("/:id/avancar", { onRequest: [autenticar], schema: { tags, security, summary: "Avançar status da OS", description: "Recebida → Em Diagnóstico → Aguardando Aprovação → Em Execução → Finalizada → Entregue", params: paramsIdSchema, body: avancarStatusSchema, response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await avancarStatus.execute(req.params.id, req.body) as any));

  fastify.patch("/:id/aprovar-orcamento", {
    schema: { tags, summary: "Aprovar ou recusar orçamento (notificação externa)", description: "Aprovação avança para Em Execução; recusa retorna para Em Diagnóstico.", params: paramsIdSchema, body: aprovarOrcamentoSchema, response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, async (req, rep) => rep.send(await aprovarOrcamento.execute(req.params.id, req.body) as any));

  fastify.patch("/:id/reprovar", { onRequest: [autenticar], schema: { tags, security, summary: "Reprovar orçamento", description: "Retorna OS para Em Diagnóstico e devolve as peças ao estoque.", params: paramsIdSchema, body: reprovarOSSchema, response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await reprovarOrcamento.execute(req.params.id, req.body.observacao) as any));

  fastify.patch("/:id/cancelar", { onRequest: [autenticar], schema: { tags, security, summary: "Cancelar OS", description: "Cancela a OS e devolve as peças ao estoque. Permitido para: Recebida, Em Diagnóstico, Aguardando Aprovação e Em Execução.", params: paramsIdSchema, body: cancelarOSSchema, response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema } } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (req, rep) => rep.send(await cancelar.execute(req.params.id, req.body.motivo) as any));
};
