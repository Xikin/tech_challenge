'use strict';

/**
 * Configuração do agente New Relic.
 *
 * Carregado antes de qualquer outro módulo (ver `-r newrelic` no CMD do
 * Dockerfile), para que o agente consiga instrumentar Fastify, Prisma e o
 * driver do PostgreSQL no momento em que são exigidos.
 *
 * O agente só sobe quando NEW_RELIC_LICENSE_KEY está presente — em
 * desenvolvimento e nos testes ele fica desligado e não emite nada.
 */

const licencaPresente = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'oficina-api'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  agent_enabled: licencaPresente,

  labels: {
    environment: process.env.NODE_ENV || 'development',
    service: 'oficina-api',
  },

  distributed_tracing: {
    // Liga o trace da requisição no API Gateway/Lambda ao trace da API,
    // via cabeçalho traceparent (W3C).
    enabled: true,
  },

  logging: {
    // Log do próprio agente: stdout, para o Kubernetes coletar junto do resto.
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
    filepath: 'stdout',
  },

  application_logging: {
    enabled: true,
    forwarding: {
      // Encaminha as linhas do pino para o New Relic já decoradas com
      // trace.id e span.id — é isto que dá "logs em contexto": clicar num
      // trace lento e ver as linhas de log daquela requisição específica.
      enabled: true,
      max_samples_stored: 10000,
    },
    metrics: {
      enabled: true,
    },
    local_decorating: {
      // Desligado porque o forwarding já cobre o caso; ligar os dois duplicaria
      // os campos de correlação em cada linha.
      enabled: false,
    },
  },

  transaction_tracer: {
    enabled: true,
    // Marca como lenta qualquer transação acima de 500ms — base do painel de
    // latência de API exigido na Fase 3.
    transaction_threshold: 0.5,
    record_sql: 'obfuscated', // registra a query, nunca os valores
    explain_threshold: 500,
  },

  slow_sql: {
    enabled: true,
    max_samples: 10,
  },

  error_collector: {
    enabled: true,
    // 401/403/404/422 são respostas de negócio esperadas: contá-las como erro
    // poluiria a taxa de erro e dispararia alerta falso.
    ignore_status_codes: [400, 401, 403, 404, 409, 422],
  },

  attributes: {
    enabled: true,
    // Nunca envie credenciais nem CPF para o provedor de observabilidade.
    exclude: [
      'request.headers.authorization',
      'request.headers.cookie',
      'request.headers.x-api-key',
      'request.parameters.senha',
      'request.parameters.password',
      'request.parameters.cpf',
      'request.parameters.cpfCnpj',
    ],
  },

  // O agente adiciona ~30MB de RSS; sem isto o limite de memória do pod
  // precisaria subir junto.
  allow_all_headers: false,
};
