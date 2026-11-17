import type Redis from 'ioredis';
import type { ICache } from '../../domain/services/cache.service.interface';
import type { ILogger } from '../../domain/services/logger.service.interface';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function reviverDatas(_chave: string, valor: unknown): unknown {
  return typeof valor === 'string' && DATA_ISO.test(valor) ? new Date(valor) : valor;
}

export class RedisCache implements ICache {
  constructor(
    private readonly redis: Redis,
    private readonly logger: ILogger,
  ) {}

  async obter<T>(chave: string): Promise<T | null> {
    try {
      const bruto = await this.redis.get(chave);
      return bruto ? (JSON.parse(bruto, reviverDatas) as T) : null;
    } catch (erro) {
      this.registrarFalha('obter', chave, erro);
      return null;
    }
  }

  async definir(chave: string, valor: unknown, ttlSegundos: number): Promise<void> {
    try {
      await this.redis.set(chave, JSON.stringify(valor), 'EX', ttlSegundos);
    } catch (erro) {
      this.registrarFalha('definir', chave, erro);
    }
  }

  async remover(chave: string): Promise<void> {
    try {
      await this.redis.del(chave);
    } catch (erro) {
      this.registrarFalha('remover', chave, erro);
    }
  }

  private registrarFalha(operacao: string, chave: string, erro: unknown): void {
    this.logger.warn(
      {
        evento: 'falha_integracao',
        integracao: 'redis',
        operacao,
        chave,
        erro: erro instanceof Error ? erro.message : String(erro),
      },
      'cache indisponível; seguindo direto para o banco',
    );
  }
}
