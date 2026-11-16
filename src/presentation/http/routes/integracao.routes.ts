import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../../config/env';
import { PrismaClienteRepository } from '../../../infrastructure/database/repositories/prisma-clientes.repository';
import { IdentificarClientePorCpfUseCase } from '../../../application/use-cases/clientes/identificar-cliente-por-cpf.use-case';
import { exigirChaveDeIntegracao } from '../middlewares/integracao.middleware';
import { erroResponseSchema } from '../schemas/clientes.schema';

const identificarSchema = z.object({ cpf: z.string().min(11).max(14) });

const clienteIdentificadoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string().nullable(),
  ativo: z.boolean(),
});

export const integracaoRoutes: FastifyPluginAsync = async (instance) => {
  const fastify = instance.withTypeProvider<ZodTypeProvider>();
  const identificar = new IdentificarClientePorCpfUseCase(new PrismaClienteRepository());

  fastify.post(
    '/clientes/identificar',
    {
      onRequest: [exigirChaveDeIntegracao(env.INTEGRACAO_API_KEY)],
      schema: {
        tags: ['Integração'],
        summary: 'Identificar cliente pessoa física pelo CPF (uso da Lambda de autenticação)',
        description:
          'Exige o cabeçalho x-api-key. Substitui a leitura direta da tabela de clientes pela Lambda.',
        body: identificarSchema,
        response: {
          200: clienteIdentificadoSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
          503: erroResponseSchema,
        },
      },
    },
    async (req, rep) => rep.send(await identificar.execute(req.body.cpf)),
  );
};
