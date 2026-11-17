import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { IMessagePublisher } from '@domain/services/message-publisher.interface';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { rabbitmqConfig } from '@infrastructure/config/rabbitmq.config';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { suppressTracing } from '@opentelemetry/core';
import { context } from '@opentelemetry/api';

interface PendingRow {
  id: string;
  exchange: string;
  routingKey: string;
  payload: SagaEnvelope;
  traceparent: string | null;
  tracestate: string | null;
}

const ROUND_BUDGET_MS = 10_000;

@Injectable()
export class OutboxRelayService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly config = rabbitmqConfig().rabbitmq;
  private running = false;
  private lastFailure?: string;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: IMessagePublisher,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.config.relayIntervalMs,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // A rodada consulta o banco a cada segundo: sem isto, cada uma vira um trace vazio.
      await context.with(suppressTracing(context.active()), () =>
        this.publishPending(),
      );
    } catch (error) {
      this.logger.error(`Outbox relay round failed: ${describe(error)}`);
    } finally {
      this.running = false;
    }
  }

  async publishPending(): Promise<number> {
    return this.prisma.runInTransaction(async () => {
      const rows = await this.prisma.$queryRawUnsafe<PendingRow[]>(
        `SELECT "id", "exchange", "routingKey", "payload", "traceparent", "tracestate"
           FROM "outbox_messages"
          WHERE "publishedAt" IS NULL
          ORDER BY "createdAt"
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        this.config.relayBatchSize,
      );

      const startedAt = Date.now();
      const published: string[] = [];
      for (const row of rows) {
        if (Date.now() - startedAt > ROUND_BUDGET_MS) break;
        try {
          await this.publisher.publish(
            {
              exchange: row.exchange,
              routingKey: row.routingKey,
              envelope: row.payload,
            },
            {
              traceparent: row.traceparent ?? undefined,
              tracestate: row.tracestate ?? undefined,
            },
          );
          published.push(row.id);
        } catch (error) {
          this.warnOnce(row, error);
          break;
        }
      }

      if (published.length > 0) {
        await this.prisma.outboxMessage.updateMany({
          where: { id: { in: published } },
          data: { publishedAt: new Date() },
        });
        this.lastFailure = undefined;
        this.logger.log(
          `Outbox relay published ${published.length} message(s)`,
        );
      }
      return published.length;
    });
  }

  private warnOnce(row: PendingRow, error: unknown): void {
    const failure = `${row.id}:${describe(error)}`;
    if (failure === this.lastFailure) return;
    this.lastFailure = failure;
    this.logger.warn(
      `Could not publish outbox message ${row.id} (${row.routingKey}), will retry: ${describe(error)}`,
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
