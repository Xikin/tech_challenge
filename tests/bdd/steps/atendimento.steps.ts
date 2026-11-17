import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Dado, Quando, Então, type DataTable } from '../support/gherkin-pt';
import type { MundoDaOficina } from '../support/mundo';

const ITENS_PADRAO = [
  {
    tipo: 'SERVICO',
    referenciaId: 'srv',
    nome: 'Troca de Pastilha',
    quantidade: 1,
    precoUnitario: 200,
  },
  { tipo: 'PECA', referenciaId: 'pc', nome: 'Pastilha', quantidade: 1, precoUnitario: 85 },
];

async function abrirOS(mundo: MundoDaOficina, descricao = 'Barulho ao frear') {
  const ordem = await mundo.criarOrdem.execute({
    clienteId: mundo.clienteId,
    veiculoId: mundo.veiculoId,
    descricao,
  });
  mundo.ordemId = ordem.id;
}

async function ateAprovacao(mundo: MundoDaOficina, total = 285) {
  await abrirOS(mundo);
  await mundo.responder('execucao.evento.diagnostico-iniciado');
  await mundo.responder('execucao.evento.diagnostico-concluido', { itens: ITENS_PADRAO });
  await mundo.responder('billing.evento.orcamento-gerado', {
    orcamentoId: 'orc-1',
    valorTotal: total,
  });
}

Dado(
  'que a cliente {string} tem o veículo {string} cadastrado',
  function (this: MundoDaOficina, nome: string, placa: string) {
    this.clienteId = randomUUID();
    this.veiculoId = randomUUID();
    this.banco.clientes.set(this.clienteId, { id: this.clienteId, nome, email: 'ana@example.com' });
    this.banco.veiculos.set(this.veiculoId, {
      id: this.veiculoId,
      placa,
      clienteId: this.clienteId,
    });
  },
);

Dado(
  'uma OS aguardando a aprovação do orçamento de {float}',
  async function (this: MundoDaOficina, total: number) {
    await ateAprovacao(this, total);
  },
);

Dado('uma OS paga aguardando execução', async function (this: MundoDaOficina) {
  await ateAprovacao(this);
  await this.responder('billing.evento.orcamento-aprovado', {
    orcamentoId: 'orc-1',
    linkPagamento: 'https://mp.test/pagar',
  });
  await this.responder('billing.evento.pagamento-confirmado', { pagamentoId: 'pg-1', valor: 285 });
  await this.responder('execucao.evento.execucao-iniciada');
});

Dado('uma OS em diagnóstico', async function (this: MundoDaOficina) {
  await abrirOS(this);
  await this.responder('execucao.evento.diagnostico-iniciado');
});

Quando(
  'a oficina abre uma OS para o veículo {string} com a descrição {string}',
  async function (this: MundoDaOficina, _placa: string, descricao: string) {
    await abrirOS(this, descricao);
  },
);

Quando('o mecânico inicia o diagnóstico', async function (this: MundoDaOficina) {
  await this.responder('execucao.evento.diagnostico-iniciado');
});

Quando(
  'o mecânico conclui o diagnóstico com os itens:',
  async function (this: MundoDaOficina, tabela: DataTable) {
    const itens = tabela.hashes().map((linha, i) => ({
      tipo: linha.tipo,
      referenciaId: `item-${i}`,
      nome: linha.nome,
      quantidade: Number(linha.quantidade),
      precoUnitario: Number(linha.preco),
    }));
    await this.responder('execucao.evento.diagnostico-concluido', { itens });
  },
);

Quando(
  'o billing gera o orçamento de {float}',
  async function (this: MundoDaOficina, total: number) {
    await this.responder('billing.evento.orcamento-gerado', {
      orcamentoId: 'orc-1',
      valorTotal: total,
    });
  },
);

Quando('a cliente aprova o orçamento', async function (this: MundoDaOficina) {
  await this.responder('billing.evento.orcamento-aprovado', {
    orcamentoId: 'orc-1',
    linkPagamento: 'https://mp.test/pagar',
  });
});

Quando(
  'a cliente reprova o orçamento por {string}',
  async function (this: MundoDaOficina, motivo: string) {
    await this.responder('billing.evento.orcamento-reprovado', { orcamentoId: 'orc-1', motivo });
  },
);

Quando(
  'o Mercado Pago confirma o pagamento de {float}',
  async function (this: MundoDaOficina, valor: number) {
    await this.responder('billing.evento.pagamento-confirmado', { pagamentoId: 'pg-1', valor });
  },
);

Quando('o mecânico inicia o reparo', async function (this: MundoDaOficina) {
  await this.responder('execucao.evento.execucao-iniciada');
});

Quando('o mecânico finaliza o reparo', async function (this: MundoDaOficina) {
  await this.responder('execucao.evento.execucao-finalizada', { tempoRealMin: 80 });
});

Quando(
  'o mecânico registra falha por {string}',
  async function (this: MundoDaOficina, motivo: string) {
    await this.responder('execucao.evento.execucao-falhou', { motivo });
  },
);

Quando('a oficina entrega o veículo', async function (this: MundoDaOficina) {
  await this.entregarOrdem.execute(this.ordemId);
});

Quando(
  'a oficina cancela a OS por {string}',
  async function (this: MundoDaOficina, motivo: string) {
    await this.cancelarOrdem.execute(this.ordemId, motivo);
  },
);

Quando(
  'o serviço de execução confirma o cancelamento devolvendo as peças',
  async function (this: MundoDaOficina) {
    await this.responder('execucao.evento.cancelada', { pecasDevolvidas: 1 });
  },
);

Quando('o billing confirma o cancelamento sem estorno', async function (this: MundoDaOficina) {
  await this.responder('billing.evento.cancelado', { estornado: false });
});

Quando('o billing confirma o cancelamento com estorno', async function (this: MundoDaOficina) {
  await this.responder('billing.evento.cancelado', { estornado: true });
});

Quando(
  'o billing avisa a aprovação antes de o orçamento existir',
  async function (this: MundoDaOficina) {
    await this.responder('billing.evento.orcamento-aprovado', {
      orcamentoId: 'orc-1',
      linkPagamento: 'https://mp.test/pagar',
    });
  },
);

Quando(
  'o mesmo evento de diagnóstico concluído chega duas vezes',
  async function (this: MundoDaOficina) {
    const id = randomUUID();
    await this.responder('execucao.evento.diagnostico-concluido', { itens: ITENS_PADRAO }, id);
    await this.responder('execucao.evento.diagnostico-concluido', { itens: ITENS_PADRAO }, id);
  },
);

Então('a OS fica {string}', async function (this: MundoDaOficina, status: string) {
  assert.equal(this.erro, null, `a última mensagem falhou: ${this.erro?.message}`);
  assert.equal((await this.ordem()).status, status);
});

Então(
  'a OS continua {string} enquanto as compensações não terminam',
  async function (this: MundoDaOficina, status: string) {
    assert.equal((await this.ordem()).status, status);
  },
);

Então('a OS continua {string}', async function (this: MundoDaOficina, status: string) {
  assert.equal((await this.ordem()).status, status);
});

Então(
  'o serviço de execução recebe o comando {string}',
  function (this: MundoDaOficina, tipo: string) {
    const comandos = this.comandos(tipo);
    assert.ok(comandos.length > 0, `nenhum ${tipo} no outbox`);
    assert.ok(comandos.every((c) => c.ordemId === this.ordemId));
  },
);

Então('o billing recebe o comando {string}', function (this: MundoDaOficina, tipo: string) {
  assert.ok(this.comandos(tipo).length > 0, `nenhum ${tipo} no outbox`);
});

Então(
  'o billing recebe o comando {string} com total de {float}',
  function (this: MundoDaOficina, tipo: string, total: number) {
    const [comando] = this.comandos(tipo);
    assert.ok(comando, `nenhum ${tipo} no outbox`);
    const itens = comando.dados.itens as { quantidade: number; precoUnitario: number }[];
    const soma = itens.reduce((t, i) => t + i.quantidade * i.precoUnitario, 0);
    assert.equal(soma, total);
  },
);

Então(
  'o billing recebe {int} comando {string}',
  function (this: MundoDaOficina, quantidade: number, tipo: string) {
    assert.equal(this.comandos(tipo).length, quantidade);
  },
);

Então('a cliente recebe um e-mail pedindo a aprovação', async function (this: MundoDaOficina) {
  await new Promise((r) => setImmediate(r));
  assert.ok(this.emails.some((e) => e.tipo === 'aprovacao'));
});

Então('a cliente recebe o link de pagamento por e-mail', async function (this: MundoDaOficina) {
  await new Promise((r) => setImmediate(r));
  const email = this.emails.find((e) => e.tipo === 'pagamento');
  assert.ok(email);
  assert.equal((email.dados as { linkPagamento: string }).linkPagamento, 'https://mp.test/pagar');
});

Então('a saga termina {string}', async function (this: MundoDaOficina, status: string) {
  assert.equal((await this.saga()).status, status);
});

Então(
  'a saga entra em compensação por {string}',
  async function (this: MundoDaOficina, motivo: string) {
    const saga = await this.saga();
    assert.equal(saga.status, 'COMPENSANDO');
    assert.equal(saga.motivoFalha, motivo);
  },
);

Então('só o serviço de execução precisa compensar', async function (this: MundoDaOficina) {
  assert.deepEqual((await this.saga()).compensacoesPendentes, ['execucao']);
  assert.equal(this.comandos('billing.comando.cancelar').length, 0);
});

Então('o evento é devolvido para nova tentativa', function (this: MundoDaOficina) {
  assert.equal(this.erro?.name, 'EventoPrematuroError');
});
