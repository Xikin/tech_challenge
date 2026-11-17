import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrismaOrdemRepository } from '../../../infrastructure/database/repositories/prisma-ordens.repository';
import { PrismaSagaRepository } from '../../../infrastructure/database/repositories/prisma-saga.repository';
import { NodemailerEmailService } from '../../../infrastructure/services/nodemailer-email.service';
import { CriarOrdemUseCase } from '../../../application/use-cases/ordens/criar-ordem.use-case';
import { ListarOrdensUseCase } from '../../../application/use-cases/ordens/listar-ordens.use-case';
import { BuscarOrdemPorIdUseCase } from '../../../application/use-cases/ordens/buscar-ordem-por-id.use-case';
import { BuscarOrdemPorNumeroUseCase } from '../../../application/use-cases/ordens/buscar-ordem-por-numero.use-case';
import { ConsultarStatusPublicoUseCase } from '../../../application/use-cases/ordens/consultar-status-publico.use-case';
import { AtualizarOrdemUseCase } from '../../../application/use-cases/ordens/atualizar-ordem.use-case';
import { CancelarOrdemUseCase } from '../../../application/use-cases/ordens/cancelar-ordem.use-case';
import { EntregarOrdemUseCase } from '../../../application/use-cases/ordens/entregar-ordem.use-case';
import { ConsultarSagaUseCase } from '../../../application/use-cases/ordens/consultar-saga.use-case';
import { ExecutorDeSaga } from '../../../application/saga/executor-saga';
import { NotificadorCliente } from '../../../application/saga/notificador-cliente';
import type { ICache } from '../../../domain/services/cache.service.interface';
import type { IRastreamento } from '../../../domain/services/rastreamento.interface';
import {
  criarOSSchema,
  atualizarOSSchema,
  entregarOSSchema,
  cancelarOSSchema,
  listarOSSchema,
  paramsIdSchema,
  numeroParamsSchema,
  consultaPublicaQuerySchema,
  erroResponseSchema,
  osResponseSchema,
  listarOSResponseSchema,
  consultaPublicaResponseSchema,
  sagaResponseSchema,
} from '../schemas/ordens.schema';
import { exigirInterno, exigirDonoDoRecurso } from '../middlewares/auth.middleware';

export interface OpcoesOrdensRoutes {
  cache: ICache;
  rastreamento: IRastreamento;
}

export const ordensRoutes: FastifyPluginAsync<OpcoesOrdensRoutes> = async (instance, opcoes) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const { cache, rastreamento } = opcoes;
  const repo = new PrismaOrdemRepository();
  const sagas = new PrismaSagaRepository();
  const notificador = new NotificadorCliente(new NodemailerEmailService(), instance.log);
  const executor = new ExecutorDeSaga(sagas, notificador, cache, rastreamento, instance.log);
  const tags = ['Ordens de Serviço'];
  const security = [{ bearerAuth: [] }];

  const consultarPublico = new ConsultarStatusPublicoUseCase(repo, cache);
  const listar = new ListarOrdensUseCase(repo);
  const buscarPorNumero = new BuscarOrdemPorNumeroUseCase(repo);
  const buscarPorId = new BuscarOrdemPorIdUseCase(repo);
  const atualizar = new AtualizarOrdemUseCase(repo);
  const cancelar = new CancelarOrdemUseCase(repo, sagas, executor, cache);
  const consultarSaga = new ConsultarSagaUseCase(sagas);

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
        description:
          'Cliente informa número da OS e CPF/CNPJ para acompanhar sem autenticação. Resposta em cache no Redis por 60 s, invalidada a cada mudança de status.',
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
        summary: 'Abrir OS',
        description:
          'Cria a OS e inicia a saga: o comando de abertura de diagnóstico é gravado no outbox e publicado para o serviço de execução.',
        body: criarOSSchema,
        response: { 201: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) =>
      rep
        .status(201)
        .send(await new CriarOrdemUseCase(repo, req.log, rastreamento).execute(req.body)),
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

  fastify.get(
    '/:id/saga',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Estado e histórico da saga da OS',
        description:
          'Etapa atual, compensações pendentes e cada mensagem enviada ou recebida, em ordem.',
        params: paramsIdSchema,
        response: { 200: sagaResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await consultarSaga.execute(req.params.id)),
  );

  fastify.put(
    '/:id',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Atualizar descrição e observações da OS',
        params: paramsIdSchema,
        body: atualizarOSSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) => rep.send(await atualizar.execute(req.params.id, req.body)),
  );

  fastify.patch(
    '/:id/entregar',
    {
      onRequest: [exigirInterno],
      schema: {
        tags,
        security,
        summary: 'Registrar a entrega do veículo',
        description: 'Permitido apenas para OS Finalizada.',
        params: paramsIdSchema,
        body: entregarOSSchema,
        response: { 200: osResponseSchema, 404: erroResponseSchema, 422: erroResponseSchema },
      },
    },
    async (req, rep) =>
      rep.send(
        await new EntregarOrdemUseCase(repo, notificador, cache, req.log).execute(
          req.params.id,
          req.body.observacao,
        ),
      ),
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
          'Inicia a compensação da saga: cancela a execução (devolve peças reservadas) e o orçamento (estorna o pagamento, se houver). Responde 202 e a OS passa a Cancelada quando todos os participantes confirmarem.',
        params: paramsIdSchema,
        body: cancelarOSSchema,
        response: {
          200: osResponseSchema,
          202: osResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, rep) => {
      const { ordem, compensacaoIniciada } = await cancelar.execute(req.params.id, req.body.motivo);
      return rep.status(compensacaoIniciada ? 202 : 200).send(ordem);
    },
  );
};
