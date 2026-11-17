import { OutgoingMessage } from '@domain/messaging/saga-message';
import { context, propagation } from '@opentelemetry/api';
import { Prisma } from '@generated/prisma/client';

export class PrismaOutboxMessageMapper {
  private constructor() {
    throw new Error(
      'PrismaOutboxMessageMapper is a static class and cannot be instantiated.',
    );
  }

  public static toPrisma(
    message: OutgoingMessage,
  ): Prisma.OutboxMessageCreateManyInput {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    return {
      id: message.envelope.messageId,
      exchange: message.exchange,
      routingKey: message.routingKey,
      payload: message.envelope as unknown as Prisma.InputJsonValue,
      traceparent: carrier.traceparent ?? null,
      tracestate: carrier.tracestate ?? null,
    };
  }
}
