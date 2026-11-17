import {
  OnModuleDestroy,
  OnModuleInit,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@generated/prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';

const TRANSACTION_TIMEOUT_MS = 15_000;

type AfterCommitCallback = () => Promise<void> | void;

interface TransactionContext {
  tx: Prisma.TransactionClient;
  afterCommit: AfterCommitCallback[];
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;
  private readonly transaction = new AsyncLocalStorage<TransactionContext>();

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    this.client = new PrismaClient({ adapter });
  }

  get budget() {
    return this.db.budget;
  }
  get budgetItem() {
    return this.db.budgetItem;
  }
  get outboxMessage() {
    return this.db.outboxMessage;
  }
  get processedMessage() {
    return this.db.processedMessage;
  }

  private get db(): PrismaClient | Prisma.TransactionClient {
    return this.transaction.getStore()?.tx ?? this.client;
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.transaction.getStore()) {
      return fn();
    }
    const afterCommit: AfterCommitCallback[] = [];
    const result = await this.client.$transaction(
      (tx) => this.transaction.run({ tx, afterCommit }, fn),
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
    for (const callback of afterCommit) {
      try {
        await callback();
      } catch (error) {
        this.logger.warn(
          `After-commit callback failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return result;
  }

  afterCommit(fn: AfterCommitCallback): void {
    const context = this.transaction.getStore();
    if (context) {
      context.afterCommit.push(fn);
      return;
    }
    void Promise.resolve()
      .then(fn)
      .catch((error: unknown) =>
        this.logger.warn(
          `After-commit callback failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  $queryRawUnsafe<T = unknown>(
    query: string,
    ...values: unknown[]
  ): Promise<T> {
    return this.db.$queryRawUnsafe<T>(query, ...values);
  }

  $executeRawUnsafe(
    query: string,
    ...values: unknown[]
  ): ReturnType<PrismaClient['$executeRawUnsafe']> {
    return this.db.$executeRawUnsafe(query, ...values);
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Database connected successfully');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    this.logger.log('Database disconnected');
  }

  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase is not allowed in production');
    }
    const tableNames = [
      'outbox_messages',
      'processed_messages',
      'budget_items',
      'budgets',
    ];
    for (const tableName of tableNames) {
      await this.client.$executeRawUnsafe(
        `TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE;`,
      );
    }
  }
}
