import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let token: string;

const CLI_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VEI_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const OS_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const SAGA_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const HIST_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';
const ITEM_ID = 'f6a7b8c9-d0e1-2345-fabc-456789012345';

const sagaRow = (sobrescrever: Record<string, unknown> = {}) => ({
  id: SAGA_ID,
  ordemId: OS_ID,
  etapa: 'DIAGNOSTICO',
  status: 'EM_ANDAMENTO',
  participantes: ['execucao'],
  compensacoesPendentes: [],
  motivoFalha: null,
  versao: 0,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  ...sobrescrever,
});

const mockOS = (sobrescrever: Record<string, unknown> = {}) => ({
  id: OS_ID,
  numero: 1,
  clienteId: CLI_ID,
  veiculoId: VEI_ID,
  status: 'RECEBIDA',
  descricao: null,
  observacoes: null,
  valorTotal: 89.9,
  orcamentoId: null,
  linkPagamento: null,
  aprovadoEm: null,
  pagoEm: null,
  iniciadoEm: null,
  finalizadoEm: null,
  entregueEm: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  cliente: { id: CLI_ID, nome: 'João', cpfCnpj: '11144477735', email: null, telefone: null },
  veiculo: {
    id: VEI_ID,
    placa: 'ABC1234',
    marca: 'Toyota',
    modelo: 'Corolla',
    ano: 2020,
    cor: null,
    clienteId: CLI_ID,
    ativo: true,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  },
  itens: [
    {
      id: ITEM_ID,
      ordemId: OS_ID,
      tipo: 'SERVICO',
      referenciaId: 'srv-1',
      nome: 'Troca de óleo',
      quantidade: 1,
      precoUnitario: 89.9,
    },
  ],
  historico: [
    {
      id: HIST_ID,
      ordemId: OS_ID,
      statusAnterior: null,
      statusNovo: 'RECEBIDA',
      observacao: 'Criada',
      criadoEm: new Date(),
    },
  ],
  saga: {
    id: SAGA_ID,
    etapa: 'DIAGNOSTICO',
    status: 'EM_ANDAMENTO',
    motivoFalha: null,
    compensacoesPendentes: [],
  },
  _count: { itens: 1 },
  ...sobrescrever,
});

const transacaoUsaOProprioMock = () =>
  vi
    .mocked(prisma.$transaction)
    .mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  token = app.jwt.sign({ sub: CLI_ID, email: 'admin@test.com', role: 'ADMIN' });
});
afterAll(async () => {
  await app.close();
});

const h = () => ({ authorization: `Bearer ${token}` });

describe('GET /ordens/consulta-publica', () => {
  it('200 sem autenticação, com itens e rótulo do status', async () => {
    vi.mocked(prisma.ordemServico.findFirst).mockResolvedValue({
      ...mockOS(),
      itens: [{ tipo: 'SERVICO', nome: 'Óleo', quantidade: 1, precoUnitario: 89.9 }],
      historico: [{ statusNovo: 'RECEBIDA', observacao: null, criadoEm: new Date() }],
      veiculo: { placa: 'ABC1234', marca: 'Toyota', modelo: 'Corolla' },
    } as never);
    const res = await app.inject({
      method: 'GET',
      url: '/ordens/consulta-publica?numero=1&cpfCnpj=11144477735',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().statusLabel).toBe('Recebida');
    expect(res.json().itens[0].nome).toBe('Óleo');
  });

  it('404 OS não encontrada', async () => {
    vi.mocked(prisma.ordemServico.findFirst).mockResolvedValue(null);
    const res = await app.inject({
      method: 'GET',
      url: '/ordens/consulta-publica?numero=999&cpfCnpj=11144477735',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /ordens', () => {
  it('201 abre a OS, cria a saga e grava o comando de diagnóstico no outbox', async () => {
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: CLI_ID } as never);
    vi.mocked(prisma.veiculo.findFirst).mockResolvedValue({ id: VEI_ID } as never);
    transacaoUsaOProprioMock();
    vi.mocked(prisma.ordemServico.create).mockResolvedValue(
      mockOS({ itens: [], saga: null }) as never,
    );
    vi.mocked(prisma.sagaOS.create).mockResolvedValue(sagaRow() as never);

    const res = await app.inject({
      method: 'POST',
      url: '/ordens',
      headers: h(),
      payload: { clienteId: CLI_ID, veiculoId: VEI_ID, descricao: 'Barulho' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().saga).toMatchObject({ id: SAGA_ID, etapa: 'DIAGNOSTICO' });
    const outbox = vi.mocked(prisma.outbox.createMany).mock.calls[0][0] as {
      data: { routingKey: string; payload: { sagaId: string; dados: unknown } }[];
    };
    expect(outbox.data).toHaveLength(1);
    expect(outbox.data[0].routingKey).toBe('execucao.comando.abrir-diagnostico');
    expect(outbox.data[0].payload.sagaId).toBe(SAGA_ID);
    expect(outbox.data[0].payload.dados).toMatchObject({
      numeroOS: 1,
      veiculo: { placa: 'ABC1234' },
    });
    expect(prisma.passoSaga.createMany).toHaveBeenCalled();
  });

  it('422 com corpo inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ordens',
      headers: h(),
      payload: { clienteId: 'x' },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('consultas autenticadas', () => {
  it('GET /ordens lista', async () => {
    vi.mocked(prisma.ordemServico.findMany).mockResolvedValue([
      mockOS({ status: 'RECEBIDA' }),
      mockOS({ id: SAGA_ID, status: 'EM_EXECUCAO' }),
    ] as never);
    vi.mocked(prisma.ordemServico.count).mockResolvedValue(2);
    const res = await app.inject({ method: 'GET', url: '/ordens', headers: h() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((o: { status: string }) => o.status)).toEqual([
      'EM_EXECUCAO',
      'RECEBIDA',
    ]);
  });

  it('GET /ordens filtra por status novo da saga', async () => {
    vi.mocked(prisma.ordemServico.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.ordemServico.count).mockResolvedValue(0);
    const res = await app.inject({
      method: 'GET',
      url: '/ordens?status=AGUARDANDO_PAGAMENTO&dataInicio=2026-01-01T00:00:00Z&dataFim=2026-12-31T00:00:00Z',
      headers: h(),
    });
    expect(res.statusCode).toBe(200);
  });

  it('401 sem token', async () => {
    expect((await app.inject({ method: 'GET', url: '/ordens' })).statusCode).toBe(401);
  });

  it('GET /ordens/:id 200 com itens e resumo da saga', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(mockOS() as never);
    const res = await app.inject({ method: 'GET', url: `/ordens/${OS_ID}`, headers: h() });
    expect(res.statusCode).toBe(200);
    expect(res.json().itens[0].precoUnitario).toBe(89.9);
    expect(res.json().saga.status).toBe('EM_ANDAMENTO');
  });

  it('GET /ordens/:id 404', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: `/ordens/${OS_ID}`, headers: h() });
    expect(res.statusCode).toBe(404);
  });

  it('GET /ordens/numero/:numero 200', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(mockOS() as never);
    const res = await app.inject({ method: 'GET', url: '/ordens/numero/1', headers: h() });
    expect(res.statusCode).toBe(200);
  });

  it('GET /ordens/:id/saga 200 com os passos', async () => {
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValue({
      ...sagaRow(),
      passos: [
        {
          id: HIST_ID,
          sagaId: SAGA_ID,
          direcao: 'ENVIADA',
          tipo: 'execucao.comando.abrir-diagnostico',
          mensagemId: 'm-1',
          detalhe: null,
          criadoEm: new Date(),
        },
      ],
    } as never);
    const res = await app.inject({ method: 'GET', url: `/ordens/${OS_ID}/saga`, headers: h() });
    expect(res.statusCode).toBe(200);
    expect(res.json().passos[0].tipo).toBe('execucao.comando.abrir-diagnostico');
  });

  it('GET /ordens/:id/saga 404 sem saga', async () => {
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: `/ordens/${OS_ID}/saga`, headers: h() });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /ordens/:id', () => {
  it('400 OS finalizada', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(
      mockOS({ status: 'FINALIZADA' }) as never,
    );
    const res = await app.inject({
      method: 'PUT',
      url: `/ordens/${OS_ID}`,
      headers: h(),
      payload: { descricao: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('200 atualiza OS editável', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(mockOS() as never);
    vi.mocked(prisma.ordemServico.update).mockResolvedValue(
      mockOS({ descricao: 'Nova desc' }) as never,
    );
    const res = await app.inject({
      method: 'PUT',
      url: `/ordens/${OS_ID}`,
      headers: h(),
      payload: { descricao: 'Nova desc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().descricao).toBe('Nova desc');
  });
});

describe('PATCH /ordens/:id/entregar', () => {
  it('200 entrega OS finalizada', async () => {
    vi.mocked(prisma.ordemServico.findUnique)
      .mockResolvedValueOnce(mockOS({ status: 'FINALIZADA' }) as never)
      .mockResolvedValueOnce(mockOS({ status: 'ENTREGUE' }) as never);
    transacaoUsaOProprioMock();
    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/entregar`,
      headers: h(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ENTREGUE');
    expect(prisma.historicoOS.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ statusAnterior: 'FINALIZADA', statusNovo: 'ENTREGUE' }),
    });
    expect(prisma.ordemServico.update).toHaveBeenCalledWith({
      where: { id: OS_ID },
      data: expect.objectContaining({ status: 'ENTREGUE', entregueEm: expect.any(Date) }),
    });
  });

  it('400 OS ainda em execução', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(
      mockOS({ status: 'EM_EXECUCAO' }) as never,
    );
    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/entregar`,
      headers: h(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /ordens/:id/cancelar', () => {
  it('202 inicia a compensação da saga', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(mockOS() as never);
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValue(sagaRow() as never);
    vi.mocked(prisma.sagaOS.updateMany).mockResolvedValue({ count: 1 } as never);
    transacaoUsaOProprioMock();

    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/cancelar`,
      headers: h(),
      payload: { motivo: 'Cliente desistiu' },
    });

    expect(res.statusCode).toBe(202);
    expect(prisma.sagaOS.updateMany).toHaveBeenCalledWith({
      where: { id: SAGA_ID, versao: 0 },
      data: expect.objectContaining({
        status: 'COMPENSANDO',
        compensacoesPendentes: ['execucao'],
        motivoFalha: 'Cliente desistiu',
      }),
    });
    const outbox = vi.mocked(prisma.outbox.createMany).mock.calls[0][0] as {
      data: { routingKey: string }[];
    };
    expect(outbox.data.map((d) => d.routingKey)).toEqual(['execucao.comando.cancelar']);
  });

  it('409 quando outro processo alterou a saga ao mesmo tempo', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(mockOS() as never);
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValue(sagaRow() as never);
    vi.mocked(prisma.sagaOS.updateMany).mockResolvedValue({ count: 0 } as never);
    transacaoUsaOProprioMock();

    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/cancelar`,
      headers: h(),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  it('200 cancela direto OS antiga, sem saga', async () => {
    vi.mocked(prisma.ordemServico.findUnique)
      .mockResolvedValueOnce(mockOS({ saga: null }) as never)
      .mockResolvedValueOnce(mockOS({ status: 'CANCELADA', saga: null }) as never);
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValue(null);
    transacaoUsaOProprioMock();

    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/cancelar`,
      headers: h(),
      payload: { motivo: 'Cliente desistiu' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('CANCELADA');
  });

  it('400 saga já concluída', async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(
      mockOS({ status: 'FINALIZADA' }) as never,
    );
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValue(
      sagaRow({ etapa: 'CONCLUIDA', status: 'CONCLUIDA' }) as never,
    );
    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/cancelar`,
      headers: h(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('401 sem autenticação', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/cancelar`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('integração sem chave configurada', () => {
  it('503 em vez de aceitar qualquer chamada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/integracao/clientes/identificar',
      headers: { 'x-api-key': 'qualquer' },
      payload: { cpf: '52998224725' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('INTEGRACAO_DESABILITADA');
  });
});

describe('erros do próprio Fastify', () => {
  it('corpo JSON vazio devolve 400, não 500', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/ordens/${OS_ID}/entregar`,
      headers: { ...h(), 'content-type': 'application/json' },
      payload: '',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('FST_ERR_CTP_EMPTY_JSON_BODY');
  });
});
