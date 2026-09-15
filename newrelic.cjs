'use strict';

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
    enabled: true,
  },

  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
    filepath: 'stdout',
  },

  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
      max_samples_stored: 10000,
    },
    metrics: {
      enabled: true,
    },
    local_decorating: {
      enabled: false,
    },
  },

  transaction_tracer: {
    enabled: true,
    transaction_threshold: 0.5,
    record_sql: 'obfuscated',
    explain_threshold: 500,
  },

  slow_sql: {
    enabled: true,
    max_samples: 10,
  },

  error_collector: {
    enabled: true,
    ignore_status_codes: [400, 401, 403, 404, 409, 422],
  },

  attributes: {
    enabled: true,
    exclude: [
      'request.headers.authorization',
      'request.headers.cookie',
      'request.headers.x-api-key',
      'request.parameters.senha',
      'request.parameters.password',
      'request.parameters.cpf',
      'request.parameters.cpfCnpj',
      'request.uri',
    ],
  },

  allow_all_headers: false,
};
