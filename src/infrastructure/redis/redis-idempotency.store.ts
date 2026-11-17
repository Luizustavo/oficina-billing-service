import { IIdempotencyStore } from '@domain/services/idempotency-store.interface';
import { Injectable, Logger } from '@nestjs/common';
import { RedisClient } from './redis.client';

/** Sem REDIS_URL (testes, desenvolvimento) vira memória local; o banco continua barrando duplicatas. */
@Injectable()
export class RedisIdempotencyStore implements IIdempotencyStore {
  private readonly logger = new Logger(RedisIdempotencyStore.name);
  private readonly local = new Map<string, number>();

  constructor(private readonly redis: RedisClient) {}

  async seen(key: string): Promise<boolean> {
    if (!this.redis.enabled) {
      return (this.local.get(key) ?? 0) > Date.now();
    }
    try {
      return (await this.redis.connection.exists(key)) === 1;
    } catch (error) {
      this.logger.warn(`Redis unavailable, skipping dedup: ${String(error)}`);
      return false;
    }
  }

  async remember(key: string, ttlSeconds: number): Promise<void> {
    if (!this.redis.enabled) {
      this.local.set(key, Date.now() + ttlSeconds * 1000);
      return;
    }
    try {
      await this.redis.connection.set(key, '1', 'EX', ttlSeconds, 'NX');
    } catch (error) {
      this.logger.warn(
        `Redis unavailable, not remembering ${key}: ${String(error)}`,
      );
    }
  }
}
