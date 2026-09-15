import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaOrdemRepository } from '../../../infrastructure/database/repositories/prisma-ordens.repository';
import { NodemailerEmailService } from '../../../infrastructure/services/nodemailer-email.service';
import { CriarOrdemUseCase } from '../../../application/use-cases/ordens/criar-ordem.use-case';
import { ListarOrdensUseCase } from '../../../application/use-cases/ordens/listar-ordens.use-case';
import { BuscarOrdemPorIdUseCase } from '../../../application/use-cases/ordens/buscar-ordem-por-id.use-case';
import { BuscarOrdemPorNumeroUseCase } from '../../../application/use-cases/ordens/buscar-ordem-por-numero.use-case';
import { ConsultarStatusPublicoUseCase } from '../../../application/use-cases/ordens/consultar-status-publico.use-case';
import { AtualizarOrdemUseCase } from '../../../application/use-cases/ordens/atualizar-ordem.use-case';
import { AdicionarItensUseCase } from '../../../application/use-cases/ordens/adicionar-itens.use-case';
import { AvancarStatusUseCase } from '../../../application/use-cases/ordens/avancar-status.use-case';
import { AprovarOrcamentoUseCase } from '../../../application/use-cases/ordens/aprovar-orcamento.use-case';
import type { ILogger } from '../../../domain/services/logger.service.interface';
import { ReprovarOrcamentoUseCase } from '../../../application/use-cases/ordens/reprovar-orcamento.use-case';
import { CancelarOrdemUseCase } from '../../../application/use-cases/ordens/cancelar-ordem.use-case';
import {
  criarOSSchema,
  atualizarOSSchema,
  adicionarItensSchema,
  avancarStatusSchema,
  reprovarOSSchema,
  cancelarOSSchema,
  aprovarOrcamentoSchema,
  listarOSSchema,
  paramsIdSchema,
  numeroParamsSchema,
  consultaPublicaQuerySchema,
  erroResponseSchema,
  osResponseSchema,
  listarOSResponseSchema,
  consultaPublicaResponseSchema,
} from '../schemas/ordens.schema';
import { exigirInterno, exigirDonoDoRecurso } from '../middlewares/auth.middleware';

export const ordensRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const repo = new PrismaOrdemRepository();
  const emailService = new NodemailerEmailService();
  const tags = ['Ordens de Serviço'];
  const security = [{ bearerAuth: [] }];

  const consultarPublico = new ConsultarStatusPublicoUseCase(repo);
  const criar = (logger: ILogger) => new CriarOrdemUseCase(repo, logger);
  const listar = new ListarOrdensUseCase(repo);
  const buscarPorNumero = new BuscarOrdemPorNumeroUseCase(repo);
  const buscarPorId = new BuscarOrdemPorIdUseCase(repo);
  const atualizar = new AtualizarOrdemUseCase(repo);
  const adicionarItens = new AdicionarItensUseCase(repo);
  const avancarStatus = (logger: ILogger) => new AvancarStatusUseCase(repo, emailService, logger);
  const aprovarOrcamento = (logger: ILogger) =>
    new AprovarOrcamentoUseCase(repo, emailService, logger);
  const reprovarOrcamento = new ReprovarOrcamentoUseCase(repo);
  const cancelar = new CancelarOrdemUseCase(repo);

  const donoPorId = exigirDonoDoRecurso(async (req) => {
    const { id } = req.params as { id: string };
    const os = await repo.buscarPorId(id);
    return os ? os.cliente.id : null;
  });

  const donoPorNumero = exigirDonoDoRecurso(async (req) => {
    const { numero } = req.params as { numero: number };
    const os = await repo.buscarPorNumero(Number(numero));
    return os ? os.cliente.id : null;
  });

  fastify.get(
    '/consulta-publica',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
          hook: 'preHandler',
          keyGenerator: (req) =>
            `consulta-publica:${String((req.query as { numero?: unknown } | undefined)?.numero ?? '')}`,
        },
      },
      schema: {
        tags,
        summary: 'Consultar status da OS (sem login)',
        description: 'Cliente informa número da OS e CPF/CNPJ para acompanhar sem autenticação.',
        querystring: consultaPublicaQuerySchema,
        response: {
          200: consultaPublicaResponseSchema,
          404: erroResponseSchema,
          400: erroResponseSchema,
        },
      },
    },
    async (req, rep) =>
      rep.send(await consultarPublico.execute(req.query.numero, req.query.cpfCnpj)),
  );

  fastify.post(
    '/',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Criar OS',
        body: criarOSSchema,
        response: { 201: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => rep.status(201).send(await criar(req.log).execute(req.body)),
  );

  fastify.get(
    '/',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Listar OS',
        querystring: listarOSSchema,
        response: { 200: listarOSResponseSchema, 401: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await listar.execute(req.query)),
  );

  fastify.get(
    '/numero/:numero',
    {
      onRequest: [donoPorNumero],
      schema: {
        tags,
        security,
        summary: 'Buscar OS por número',
        params: numeroParamsSchema,
        response: { 200: osResponseSchema, 401: erroResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await buscarPorNumero.execute(req.params.numero)),
  );

  fastify.get(
    '/:id',
    {
      onRequest: [donoPorId],
      schema: {
        tags,
        security,
        summary: 'Buscar OS por ID',
        params: paramsIdSchema,
        response: { 200: osResponseSchema, 401: erroResponseSchema, 404: erroResponseSchema },
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
        summary: 'Atualizar OS',
        params: paramsIdSchema,
        body: atualizarOSSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await atualizar.execute(req.params.id, req.body)),
  );

  fastify.post(
    '/:id/itens',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Adicionar itens à OS',
        description: 'Permitido apenas para OS Recebida, Em Diagnóstico ou Aguardando Aprovação.',
        params: paramsIdSchema,
        body: adicionarItensSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await adicionarItens.execute(req.params.id, req.body)),
  );

  fastify.patch(
    '/:id/avancar',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Avançar status da OS',
        description:
          'Recebida → Em Diagnóstico → Aguardando Aprovação → Em Execução → Finalizada → Entregue',
        params: paramsIdSchema,
        body: avancarStatusSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await avancarStatus(req.log).execute(req.params.id, req.body)),
  );

  fastify.patch(
    '/:id/aprovar-orcamento',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Aprovar ou recusar orçamento',
        description: 'Aprovação avança para Em Execução; recusa retorna para Em Diagnóstico.',
        params: paramsIdSchema,
        body: aprovarOrcamentoSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await aprovarOrcamento(req.log).execute(req.params.id, req.body)),
  );

  fastify.patch(
    '/:id/reprovar',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Reprovar orçamento',
        description: 'Retorna OS para Em Diagnóstico e devolve as peças ao estoque.',
        params: paramsIdSchema,
        body: reprovarOSSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) =>
      rep.send(await reprovarOrcamento.execute(req.params.id, req.body.observacao)),
  );

  fastify.patch(
    '/:id/cancelar',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Cancelar OS',
        description:
          'Cancela a OS e devolve as peças ao estoque. Permitido para: Recebida, Em Diagnóstico, Aguardando Aprovação e Em Execução.',
        params: paramsIdSchema,
        body: cancelarOSSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await cancelar.execute(req.params.id, req.body.motivo)),
  );
};
