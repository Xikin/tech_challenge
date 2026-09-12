import { z } from 'zod';
import 'dotenv/config';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),

    // Assina e valida o login interno (ADMIN/FUNCIONARIO). Nunca sai desta API.
    JWT_SECRET: z.string().min(32),
    // Valida os tokens da Lambda de autenticação por CPF (papel CLIENTE).
    // Precisa ser o mesmo configurado na Lambda e DIFERENTE do JWT_SECRET: com
    // um segredo único, quem obtivesse o da Lambda forjaria tokens de ADMIN.
    JWT_CLIENTE_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('8h'),

    BCRYPT_ROUNDS: z.coerce.number().default(12),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('Oficina Mecânica <noreply@oficina.com>'),
    ALLOWED_ORIGINS: z.string().default(''),

    // Fase 3 — observabilidade
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    // O entregável exige "link para o Swagger das APIs"; por isso o default é
    // ligado inclusive em produção. Desligue com SWAGGER_ENABLED=false se a API
    // for exposta a um público não confiável.
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // New Relic. O agente só sobe quando a licença está presente; em
    // desenvolvimento e nos testes ele fica inteiramente desligado.
    NEW_RELIC_LICENSE_KEY: z.string().optional(),
    NEW_RELIC_APP_NAME: z.string().default('oficina-api'),
  })
  .refine((e) => e.JWT_SECRET !== e.JWT_CLIENTE_SECRET, {
    message: 'JWT_CLIENTE_SECRET deve ser diferente de JWT_SECRET',
    path: ['JWT_CLIENTE_SECRET'],
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Variáveis de ambiente inválidas:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
