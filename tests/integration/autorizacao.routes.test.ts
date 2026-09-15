import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { EMISSOR_CLIENTE, EMISSOR_INTERNO } from '../../src/domain/auth/emissores';

let app: FastifyInstance;

const CLIENTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const OUTRO_CLIENTE_ID = '99999999-9999-9999-9999-999999999999';
const VEICULO_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const OS_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

let tokenCliente: string;
let tokenOutroCliente: string;
let tokenFuncionario: string;

function ordemDe(clienteId: string) {
  return {
    id: OS_ID,
    numero: 42,
    clienteId,
    veiculoId: VEICULO_ID,
    status: 'RECEBIDA',
    descricao: null,
    observacoes: null,
    valorTotal: 100,
    aprovadoEm: null,
    iniciadoEm: null,
    finalizadoEm: null,
    entregueEm: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    cliente: { id: clienteId, nome: 'Ana', cpfCnpj: '52998224725', email: null, telefone: null },
    veiculo: {
      id: VEICULO_ID,
      placa: 'ABC1234',
      marca: 'VW',
      modelo: 'Gol',
      ano: 2020,
      cor: null,
      clienteId,
      ativo: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    },
    servicos: [],
    pecas: [],
    historico: [],
  };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  tokenCliente = app.jwt.cliente.sign(
    { sub: CLIENTE_ID, role: 'CLIENTE', cpf: '52998224725', nome: 'Ana' },
    { iss: EMISSOR_CLIENTE },
  );
  tokenOutroCliente = app.jwt.cliente.sign(
    { sub: OUTRO_CLIENTE_ID, role: 'CLIENTE', cpf: '11144477735', nome: 'Bruno' },
    { iss: EMISSOR_CLIENTE },
  );
  tokenFuncionario = app.jwt.sign({
    sub: 'func-1',
    email: 'func@oficina.com',
    role: 'FUNCIONARIO',
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.resetAllMocks();
});

const comoCliente = () => ({ authorization: `Bearer ${tokenCliente}` });
const comoOutroCliente = () => ({ authorization: `Bearer ${tokenOutroCliente}` });
const comoFuncionario = () => ({ authorization: `Bearer ${tokenFuncionario}` });

describe('rotas internas rejeitam o papel CLIENTE', () => {
  const rotasInternas: Array<[string, string]> = [
    ['GET', '/clientes'],
    ['GET', '/ordens'],
    ['GET', '/veiculos'],
    ['GET', '/servicos'],
    ['GET', '/pecas'],
  ];

  it.each(rotasInternas)('%s %s devolve 403 para CLIENTE', async (method, url) => {
    const res = await app.inject({ method: method as 'GET', url, headers: comoCliente() });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('PUT /ordens/:id devolve 403 para CLIENTE, mesmo sendo a própria OS', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/ordens/${OS_ID}`,
      headers: comoCliente(),
      payload: { descricao: 'tentativa de alteração' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('PATCH /ordens/:id/avancar devolve 403 para CLIENTE', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/avancar`,
      headers: comoCliente(),
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('CLIENTE acessa apenas os próprios recursos', () => {
  it('lê a própria OS por id', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(ordemDe(CLIENTE_ID) as never);

    const res = await app.inject({
      method: 'GET',
      url: `/ordens/${OS_ID}`,
      headers: comoCliente(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(OS_ID);
  });

  it('recebe 403 ao tentar ler a OS de outro cliente', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(ordemDe(CLIENTE_ID) as never);

    const res = await app.inject({
      method: 'GET',
      url: `/ordens/${OS_ID}`,
      headers: comoOutroCliente(),
    });

    expect(res.statusCode).toBe(403);
  });

  it('lê a própria OS por número', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(ordemDe(CLIENTE_ID) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/ordens/numero/42',
      headers: comoCliente(),
    });

    expect(res.statusCode).toBe(200);
  });

  it('recebe 403 ao tentar ler por número a OS de outro cliente', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(ordemDe(CLIENTE_ID) as never);

    const res = await app.inject({
      method: 'GET',
      url: '/ordens/numero/42',
      headers: comoOutroCliente(),
    });

    expect(res.statusCode).toBe(403);
  });

  it('lê o próprio cadastro em /clientes/:id', async () => {
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
      id: CLIENTE_ID,
      nome: 'Ana',
      cpfCnpj: '52998224725',
      tipoPessoa: 'FISICA',
      email: null,
      telefone: null,
      endereco: null,
      ativo: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      veiculos: [],
      ordens: [],
    } as never);

    const res = await app.inject({
      method: 'GET',
      url: `/clientes/${CLIENTE_ID}`,
      headers: comoCliente(),
    });

    expect(res.statusCode).toBe(200);
  });

  it('recebe 403 ao tentar ler o cadastro de outro cliente', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/clientes/${OUTRO_CLIENTE_ID}`,
      headers: comoCliente(),
    });

    expect(res.statusCode).toBe(403);
  });

  it('não vaza existência: OS inexistente devolve 404, não 403', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(null as never);

    const res = await app.inject({
      method: 'GET',
      url: `/ordens/${OS_ID}`,
      headers: comoCliente(),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('pessoal interno mantém acesso amplo', () => {
  it('FUNCIONARIO lê a OS de qualquer cliente', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(ordemDe(OUTRO_CLIENTE_ID) as never);

    const res = await app.inject({
      method: 'GET',
      url: `/ordens/${OS_ID}`,
      headers: comoFuncionario(),
    });

    expect(res.statusCode).toBe(200);
  });

  it('FUNCIONARIO lista todas as ordens', async () => {
    vi.mocked(prisma.ordemServico.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.ordemServico.count).mockResolvedValue(0 as never);

    const res = await app.inject({ method: 'GET', url: '/ordens', headers: comoFuncionario() });

    expect(res.statusCode).toBe(200);
  });
});

describe('correlação de requisições', () => {
  it('devolve x-request-id em toda resposta', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('honra o x-request-id propagado pelo API Gateway', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'trace-do-gateway' },
    });

    expect(res.headers['x-request-id']).toBe('trace-do-gateway');
  });

  it('devolve o id de correlação também em respostas de erro', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ordens',
      headers: { ...comoCliente(), 'x-request-id': 'trace-403' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['x-request-id']).toBe('trace-403');
  });
});

describe('healthchecks', () => {
  it('/health responde sem tocar no banco', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('/health/ready responde 200 quando o banco está acessível', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);

    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(200);
    expect(res.json().dependencias.database).toBe('ok');
  });

  it('/health/ready responde 503 quando o banco está fora', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(503);
    expect(res.json().dependencias.database).toBe('indisponivel');
  });
});

describe('amarração entre emissor e papel (ADR-0011)', () => {
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  it('recusa token assinado com o segredo de clientes alegando ADMIN', async () => {
    const forjado = app.jwt.cliente.sign(
      { sub: CLIENTE_ID, role: 'ADMIN', email: 'atacante@x.com' },
      { iss: EMISSOR_CLIENTE },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/auth/usuarios',
      headers: bearer(forjado),
    });
    expect(res.statusCode).toBe(401);
  });

  it('recusa token do segredo de clientes que alega o emissor interno', async () => {
    const forjado = app.jwt.cliente.sign(
      { sub: CLIENTE_ID, role: 'ADMIN', email: 'atacante@x.com' },
      { iss: EMISSOR_INTERNO },
    );
    const res = await app.inject({ method: 'GET', url: '/ordens', headers: bearer(forjado) });
    expect(res.statusCode).toBe(401);
  });

  it('recusa token do emissor interno alegando o papel CLIENTE', async () => {
    const token = app.jwt.sign({ sub: CLIENTE_ID, role: 'CLIENTE' }, { iss: EMISSOR_INTERNO });
    const res = await app.inject({
      method: 'GET',
      url: `/ordens/${OS_ID}`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(401);
  });

  it('recusa token interno sem iss', async () => {
    const token = app.jwt.sign({ sub: 'adm', email: 'adm@oficina.com', role: 'ADMIN' }, {});
    const res = await app.inject({ method: 'GET', url: '/ordens', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });

  it('recusa token de cliente sem iss', async () => {
    const token = app.jwt.cliente.sign({ sub: CLIENTE_ID, role: 'CLIENTE' }, {});
    const res = await app.inject({
      method: 'GET',
      url: `/ordens/${OS_ID}`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(401);
  });

  it('mantém o login interno funcionando com o iss do emissor interno', async () => {
    vi.mocked(prisma.ordemServico.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.ordemServico.count).mockResolvedValue(0 as never);

    const res = await app.inject({ method: 'GET', url: '/ordens', headers: comoFuncionario() });
    expect(res.statusCode).toBe(200);
  });
});

describe('/auth/me', () => {
  it('responde 200 para cliente sem e-mail cadastrado (antes respondia 500)', async () => {
    const semEmail = app.jwt.cliente.sign(
      { sub: OUTRO_CLIENTE_ID, role: 'CLIENTE', cpf: '11144477735', nome: 'Bruno' },
      { iss: EMISSOR_CLIENTE },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${semEmail}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sub: OUTRO_CLIENTE_ID, role: 'CLIENTE', nome: 'Bruno' });
    expect(res.json()).not.toHaveProperty('email');
  });

  it('não devolve o CPF do cliente', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: comoCliente() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('cpf');
  });
});
