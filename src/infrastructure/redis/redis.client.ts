import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { redisConfig } from '@infrastructure/config/redis.config';
import Redis from 'ioredis';

@Injectable()
export class RedisClient implements OnModuleDestroy {
  private readonly logger = new Logger(RedisClient.name);
  private readonly url = redisConfig().redis.url;
  private client?: Redis;

  get enabled(): boolean {
    return this.url.length > 0;
  }

  get connection(): Redis {
    if (!this.client) {
      this.client = new Redis(this.url, { maxRetriesPerRequest: 2 });
      this.client.on('error', (error: Error) =>
        this.logger.warn(`Redis error: ${error.message}`),
      );
    }
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }
}
