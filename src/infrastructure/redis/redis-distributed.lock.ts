import { IDistributedLock } from '@domain/services/distributed-lock.interface';
import { DomainException } from '@shared/exceptions/domain.exceptions';
import { RedisClient } from './redis.client';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

const RELEASE_IF_OWNER = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

const ATTEMPTS = 50;
const WAIT_MS = 100;

@Injectable()
export class RedisDistributedLock implements IDistributedLock {
  private readonly local = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: RedisClient) {}

  async run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    return this.redis.enabled
      ? this.withRedis(key, ttlMs, fn)
      : this.withMemory(key, fn);
  }

  private async withRedis<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const token = randomUUID();
    const redis = this.redis.connection;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if ((await redis.set(key, token, 'PX', ttlMs, 'NX')) === 'OK') {
        try {
          return await fn();
        } finally {
          await redis.eval(RELEASE_IF_OWNER, 1, key, token);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    }
    throw new DomainException(`Could not acquire lock ${key}`);
  }

  private async withMemory<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.local.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(fn);
    this.local.set(key, current);
    try {
      return await current;
    } finally {
      if (this.local.get(key) === current) this.local.delete(key);
    }
  }
}
