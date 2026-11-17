import { z } from 'zod';
import type { DecimalLike } from '../../../domain/types/decimal-like';
import { STATUS_OS, type StatusOS } from '../../../domain/enums/status-os.enum';
import { validarCPF, validarCNPJ, limparDocumento } from '../../../shared/utils/validators';

const cpfCnpjSchema = z
  .string()
  .transform(limparDocumento)
  .refine(
    (doc) => (doc.length === 11 ? validarCPF(doc) : doc.length === 14 ? validarCNPJ(doc) : false),
    { message: 'CPF ou CNPJ inválido' },
  );

export const criarOSSchema = z.object({
  clienteId: z.string().uuid(),
  veiculoId: z.string().uuid(),
  descricao: z.string().max(2000).optional(),
  observacoes: z.string().max(2000).optional(),
});

export const atualizarOSSchema = z.object({
  descricao: z.string().max(2000).optional(),
  observacoes: z.string().max(2000).optional(),
});

export const entregarOSSchema = z.object({
  observacao: z.string().max(1000).optional(),
});

export const cancelarOSSchema = z.object({
  motivo: z.string().min(1).max(500).optional(),
});

export const listarOSSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(STATUS_OS as [StatusOS, ...StatusOS[]]).optional(),
  clienteId: z.string().uuid().optional(),
  veiculoId: z.string().uuid().optional(),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
});

export const paramsIdSchema = z.object({ id: z.string().uuid() });
export const numeroParamsSchema = z.object({ numero: z.coerce.number().int() });

export const consultaPublicaQuerySchema = z.object({
  numero: z.coerce.number().int().positive(),
  cpfCnpj: cpfCnpjSchema,
});

export const erroResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
});

const historicoOSItemSchema = z.object({
  id: z.string().uuid(),
  ordemId: z.string().uuid(),
  statusAnterior: z.string().nullable(),
  statusNovo: z.string(),
  observacao: z.string().nullable(),
  criadoEm: z.date(),
});

const precoSchema = z.number() as z.ZodType<number | DecimalLike>;

const itemOSSchema = z.object({
  id: z.string().uuid(),
  ordemId: z.string().uuid(),
  tipo: z.enum(['SERVICO', 'PECA']),
  referenciaId: z.string(),
  nome: z.string(),
  quantidade: z.number().int(),
  precoUnitario: precoSchema,
});

const sagaResumoSchema = z.object({
  id: z.string().uuid(),
  etapa: z.string(),
  status: z.string(),
  motivoFalha: z.string().nullable(),
  compensacoesPendentes: z.array(z.string()),
});

export const osResponseSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  clienteId: z.string().uuid(),
  veiculoId: z.string().uuid(),
  status: z.string(),
  descricao: z.string().nullable(),
  observacoes: z.string().nullable(),
  valorTotal: precoSchema,
  orcamentoId: z.string().nullable(),
  linkPagamento: z.string().nullable(),
  aprovadoEm: z.date().nullable(),
  pagoEm: z.date().nullable(),
  iniciadoEm: z.date().nullable(),
  finalizadoEm: z.date().nullable(),
  entregueEm: z.date().nullable(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
  cliente: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    cpfCnpj: z.string(),
    email: z.string().nullable(),
    telefone: z.string().nullable(),
  }),
  veiculo: z.object({
    id: z.string().uuid(),
    placa: z.string(),
    marca: z.string(),
    modelo: z.string(),
    ano: z.number().int(),
    cor: z.string().nullable(),
    clienteId: z.string().uuid(),
    ativo: z.boolean(),
    criadoEm: z.date(),
    atualizadoEm: z.date(),
  }),
  itens: z.array(itemOSSchema),
  historico: z.array(historicoOSItemSchema),
  saga: sagaResumoSchema.nullable(),
});

const osListItemSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  clienteId: z.string().uuid(),
  veiculoId: z.string().uuid(),
  status: z.string(),
  descricao: z.string().nullable(),
  observacoes: z.string().nullable(),
  valorTotal: precoSchema,
  aprovadoEm: z.date().nullable(),
  pagoEm: z.date().nullable(),
  iniciadoEm: z.date().nullable(),
  finalizadoEm: z.date().nullable(),
  entregueEm: z.date().nullable(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
  cliente: z.object({ id: z.string().uuid(), nome: z.string(), cpfCnpj: z.string() }),
  veiculo: z.object({
    id: z.string().uuid(),
    placa: z.string(),
    marca: z.string(),
    modelo: z.string(),
  }),
  _count: z.object({ itens: z.number().int() }),
});

export const listarOSResponseSchema = z.object({
  data: z.array(osListItemSchema),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const consultaPublicaResponseSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  status: z.string(),
  statusLabel: z.string(),
  valorTotal: precoSchema,
  linkPagamento: z.string().nullable(),
  criadoEm: z.date(),
  aprovadoEm: z.date().nullable(),
  pagoEm: z.date().nullable(),
  iniciadoEm: z.date().nullable(),
  finalizadoEm: z.date().nullable(),
  entregueEm: z.date().nullable(),
  veiculo: z.object({ placa: z.string(), marca: z.string(), modelo: z.string() }),
  itens: z.array(
    z.object({
      tipo: z.enum(['SERVICO', 'PECA']),
      nome: z.string(),
      quantidade: z.number().int(),
      precoUnitario: precoSchema,
    }),
  ),
  historico: z.array(
    z.object({ statusNovo: z.string(), observacao: z.string().nullable(), criadoEm: z.date() }),
  ),
});

export const sagaResponseSchema = z.object({
  id: z.string().uuid(),
  ordemId: z.string().uuid(),
  etapa: z.string(),
  status: z.string(),
  participantes: z.array(z.string()),
  compensacoesPendentes: z.array(z.string()),
  motivoFalha: z.string().nullable(),
  versao: z.number().int(),
  criadoEm: z.date(),
  atualizadoEm: z.date(),
  passos: z.array(
    z.object({
      id: z.string().uuid(),
      direcao: z.enum(['ENVIADA', 'RECEBIDA']),
      tipo: z.string(),
      mensagemId: z.string(),
      detalhe: z.string().nullable(),
      criadoEm: z.date(),
    }),
  ),
});

export type CriarOSInput = z.infer<typeof criarOSSchema>;
export type AtualizarOSInput = z.infer<typeof atualizarOSSchema>;
export type ListarOSInput = z.infer<typeof listarOSSchema>;
export type CancelarOSInput = z.infer<typeof cancelarOSSchema>;
