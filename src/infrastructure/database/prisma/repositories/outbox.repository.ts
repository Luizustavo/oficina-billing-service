import { PrismaOutboxMessageMapper } from '@infrastructure/database/prisma/mappers/prisma-outbox-message.mapper';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { OutgoingMessage } from '@domain/messaging/saga-message';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OutboxRepository implements IOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async add(messages: OutgoingMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.prisma.outboxMessage.createMany({
      data: messages.map((message) =>
        PrismaOutboxMessageMapper.toPrisma(message),
      ),
    });
  }
}
