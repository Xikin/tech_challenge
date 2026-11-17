import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  COMANDOS,
  EVENTOS,
  MensagemInvalidaError,
  SERVICO_OS,
  type Mensagem,
  type MensagemSaida,
  type TipoComando,
} from '../../domain/mensageria/mensagem';
import type { EventoSaga, ItemOrcado } from '../../domain/saga/saga-os';
import type { OrdemRecord } from '../../domain/repositories/ordens.repository.interface';
import type { IRastreamento } from '../../domain/services/rastreamento.interface';

const envelopeSchema = z.object({
  id: z.string().min(1),
  tipo: z.string().min(1),
  versao: z.literal(1),
  sagaId: z.string().min(1),
  ordemId: z.string().uuid(),
  causadaPor: z.string().nullable(),
  origem: z.string().min(1),
  ocorridaEm: z.string().datetime(),
  dados: z.record(z.unknown()),
});

const itemOrcadoSchema = z.object({
  tipo: z.enum(['SERVICO', 'PECA']),
  referenciaId: z.string().min(1),
  nome: z.string().min(1),
  quantidade: z.number().int().positive(),
  precoUnitario: z.number().nonnegative(),
});

const vazio = z.object({});

const dadosPorEvento = {
  [EVENTOS.DIAGNOSTICO_INICIADO]: vazio,
  [EVENTOS.DIAGNOSTICO_CONCLUIDO]: z.object({
    itens: z.array(itemOrcadoSchema).min(1),
    observacao: z.string().optional(),
  }),
  [EVENTOS.ORCAMENTO_GERADO]: z.object({
    orcamentoId: z.string().min(1),
    valorTotal: z.number().nonnegative(),
  }),
  [EVENTOS.ORCAMENTO_FALHOU]: z.object({ motivo: z.string().min(1) }),
  [EVENTOS.ORCAMENTO_APROVADO]: z.object({
    orcamentoId: z.string().min(1),
    linkPagamento: z.string().url(),
  }),
  [EVENTOS.ORCAMENTO_REPROVADO]: z.object({
    orcamentoId: z.string().min(1),
    motivo: z.string().optional(),
  }),
  [EVENTOS.PAGAMENTO_CONFIRMADO]: z.object({
    pagamentoId: z.string().min(1),
    valor: z.number().nonnegative(),
  }),
  [EVENTOS.PAGAMENTO_RECUSADO]: z.object({ motivo: z.string().min(1) }),
  [EVENTOS.EXECUCAO_INICIADA]: vazio,
  [EVENTOS.EXECUCAO_FINALIZADA]: z.object({ tempoRealMin: z.number().int().positive().optional() }),
  [EVENTOS.EXECUCAO_FALHOU]: z.object({ motivo: z.string().min(1) }),
  [EVENTOS.EXECUCAO_CANCELADA]: vazio,
  [EVENTOS.BILLING_CANCELADO]: z.object({ estornado: z.boolean() }),
} as const;

export function lerEnvelope(bruto: unknown): Mensagem {
  const resultado = envelopeSchema.safeParse(bruto);
  if (!resultado.success)
    throw new MensagemInvalidaError(`Envelope inválido: ${resultado.error.issues[0]?.message}`);
  return resultado.data as Mensagem;
}

export function interpretarEvento(mensagem: Mensagem): EventoSaga {
  const schema = dadosPorEvento[mensagem.tipo as keyof typeof dadosPorEvento];
  if (!schema) throw new MensagemInvalidaError(`Tipo de evento desconhecido: ${mensagem.tipo}`);

  const dados = schema.safeParse(mensagem.dados);
  if (!dados.success)
    throw new MensagemInvalidaError(
      `Dados inválidos em ${mensagem.tipo}: ${dados.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    );

  return { tipo: mensagem.tipo, ...dados.data } as EventoSaga;
}

export interface ContextoDoComando {
  itens?: ItemOrcado[];
  motivo?: string;
}

export function montarDadosDoComando(
  tipo: TipoComando,
  ordem: OrdemRecord,
  contexto: ContextoDoComando,
): Record<string, unknown> {
  switch (tipo) {
    case COMANDOS.ABRIR_DIAGNOSTICO:
      return {
        numeroOS: ordem.numero,
        descricao: ordem.descricao,
        veiculo: {
          placa: ordem.veiculo.placa,
          marca: ordem.veiculo.marca,
          modelo: ordem.veiculo.modelo,
          ano: ordem.veiculo.ano,
        },
      };
    case COMANDOS.GERAR_ORCAMENTO:
      return {
        numeroOS: ordem.numero,
        cliente: { id: ordem.cliente.id, nome: ordem.cliente.nome, email: ordem.cliente.email },
        itens: contexto.itens ?? [],
      };
    case COMANDOS.LIBERAR_EXECUCAO:
      return { numeroOS: ordem.numero };
    case COMANDOS.CANCELAR_EXECUCAO:
      return { numeroOS: ordem.numero, motivo: contexto.motivo ?? 'Cancelamento da OS' };
    case COMANDOS.CANCELAR_BILLING:
      return {
        numeroOS: ordem.numero,
        orcamentoId: ordem.orcamentoId,
        motivo: contexto.motivo ?? 'Cancelamento da OS',
      };
  }
}

export function novaMensagem(
  tipo: string,
  sagaId: string,
  ordemId: string,
  dados: Record<string, unknown>,
  causadaPor: string | null,
  rastreamento: IRastreamento,
): MensagemSaida {
  return {
    mensagem: {
      id: randomUUID(),
      tipo,
      versao: 1,
      sagaId,
      ordemId,
      causadaPor,
      origem: SERVICO_OS,
      ocorridaEm: new Date().toISOString(),
      dados,
    },
    cabecalhos: rastreamento.cabecalhosDePropagacao(),
  };
}
