import { vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-long!!';
process.env.JWT_CLIENTE_SECRET = 'test-cliente-secret-min-32-chars-long!!';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '1';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(),
  StatusOS: {
    RECEBIDA: 'RECEBIDA',
    EM_DIAGNOSTICO: 'EM_DIAGNOSTICO',
    AGUARDANDO_APROVACAO: 'AGUARDANDO_APROVACAO',
    AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
    AGUARDANDO_EXECUCAO: 'AGUARDANDO_EXECUCAO',
    EM_EXECUCAO: 'EM_EXECUCAO',
    FINALIZADA: 'FINALIZADA',
    ENTREGUE: 'ENTREGUE',
    CANCELADA: 'CANCELADA',
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
    ordemServico: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    itemOS: { createMany: vi.fn(), deleteMany: vi.fn() },
    historicoOS: { create: vi.fn() },
    sagaOS: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    passoSaga: { createMany: vi.fn() },
    outbox: { createMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    mensagemProcessada: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

beforeEach(() => vi.resetAllMocks());
