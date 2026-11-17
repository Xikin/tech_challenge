import newrelic from 'newrelic';
import type { IRastreamento } from '../../domain/services/rastreamento.interface';
import type { IRastreamentoDeConsumo } from '../mensageria/rabbitmq';

export class RastreamentoNewRelic implements IRastreamento, IRastreamentoDeConsumo {
  cabecalhosDePropagacao(): Record<string, string> {
    const cabecalhos: Record<string, string> = {};
    newrelic.getTransaction().insertDistributedTraceHeaders(cabecalhos);
    return cabecalhos;
  }

  consumir<T>(
    nome: string,
    cabecalhos: Record<string, unknown>,
    atributos: Record<string, string | number>,
    executar: () => Promise<T>,
  ): Promise<T> {
    return newrelic.startBackgroundTransaction(nome, 'RabbitMQ', () => {
      newrelic
        .getTransaction()
        .acceptDistributedTraceHeaders('AMQP', cabecalhos as Record<string, string>);
      newrelic.addCustomAttributes(atributos);
      return executar();
    });
  }
}
