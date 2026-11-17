import { IDistributedLock } from '@domain/services/distributed-lock.interface';
import { DomainException } from '@shared/exceptions/domain.exceptions';
import { RedisClient } from './redis.client';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const RELEASE_IF_OWNER = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

const ATTEMPTS = 50;
const WAIT_MS = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class RedisDistributedLock implements IDistributedLock {
  private readonly local = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: RedisClient) {}

  async run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    if (!this.redis.enabled) {
      return this.withMemory(key, fn);
    }
    const token = randomUUID();
    await this.acquire(key, token, ttlMs, ATTEMPTS);
    try {
      return await fn();
    } finally {
      await this.redis.connection.eval(RELEASE_IF_OWNER, 1, key, token);
    }
  }

  private async acquire(
    key: string,
    token: string,
    ttlMs: number,
    attemptsLeft: number,
  ): Promise<void> {
    const acquired = await this.redis.connection.set(
      key,
      token,
      'PX',
      ttlMs,
      'NX',
    );
    if (acquired === 'OK') return;
    if (attemptsLeft <= 1) {
      throw new DomainException(`Could not acquire lock ${key}`);
    }
    await sleep(WAIT_MS);
    return this.acquire(key, token, ttlMs, attemptsLeft - 1);
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
