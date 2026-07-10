import { vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-long!!';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '1';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(),
  StatusOS: {
    RECEBIDA: 'RECEBIDA',
    EM_DIAGNOSTICO: 'EM_DIAGNOSTICO',
    AGUARDANDO_APROVACAO: 'AGUARDANDO_APROVACAO',
    EM_EXECUCAO: 'EM_EXECUCAO',
    FINALIZADA: 'FINALIZADA',
    ENTREGUE: 'ENTREGUE',
  },
  TipoPessoa: { FISICA: 'FISICA', JURIDICA: 'JURIDICA' },
  Role: { ADMIN: 'ADMIN', FUNCIONARIO: 'FUNCIONARIO' },
  Prisma: { Decimal: Number },
}));

vi.mock('../src/config/prisma', () => ({
  prisma: {
    usuario: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    cliente: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    veiculo: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    servico: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    peca: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    ordemServico: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    itemServicoOS: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    itemPecaOS: { findMany: vi.fn(), createMany: vi.fn() },
    historicoOS: { create: vi.fn() },
    $transaction: vi.fn((fn: any) =>
      fn({
        ordemServico: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
        itemServicoOS: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
        itemPecaOS: { createMany: vi.fn() },
        historicoOS: { create: vi.fn() },
        peca: { update: vi.fn() },
      }),
    ),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

beforeEach(() => vi.resetAllMocks());
