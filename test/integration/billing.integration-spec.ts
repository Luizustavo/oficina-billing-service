import { PrismaTransactionManager } from '@infrastructure/database/prisma/prisma-transaction-manager';
import { RabbitMqMessagePublisher } from '@infrastructure/messaging/rabbitmq-message-publisher';
import { SagaMessageHandlerRegistry } from '@infrastructure/messaging/saga-message-handler.registry';
import { BudgetRepository } from '@infrastructure/database/prisma/repositories/budget.repository';
import { OutboxRepository } from '@infrastructure/database/prisma/repositories/outbox.repository';
import { ApproveBudgetUseCase } from '@application/use-cases/budget/approve-budget.use-case';
import { CreateBudgetUseCase } from '@application/use-cases/budget/create-budget.use-case';
import { CancelBudgetUseCase } from '@application/use-cases/budget/cancel-budget.use-case';
import { RabbitMqConnection } from '@infrastructure/messaging/rabbitmq-connection.service';
import { BillingCommandHandlers } from '@infrastructure/messaging/billing-command-handlers';
import { BillingCommandsConsumer } from '@infrastructure/messaging/billing-commands.consumer';
import { OutboxRelayService } from '@infrastructure/messaging/outbox-relay.service';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { BILLING_COMMANDS_QUEUE } from '@infrastructure/messaging/topology';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { TokenRole } from '@domain/enums/token-role.enum';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { connect } from 'amqplib';

import type {
  Channel,
  ChannelModel,
  ConsumeMessage,
  GetMessage,
} from 'amqplib';

const CAPTURE_QUEUE = `test.billing-events.${randomUUID()}`;

describe('Billing Service (integração)', () => {
  let prisma: PrismaService;
  let connection: RabbitMqConnection;
  let publisher: RabbitMqMessagePublisher;
  let relay: OutboxRelayService;
  let consumer: BillingCommandsConsumer;
  let approveBudget: ApproveBudgetUseCase;
  let amqp: ChannelModel;
  let probe: Channel;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    const budgets = new BudgetRepository(prisma);
    const outbox = new OutboxRepository(prisma);
    const transactions = new PrismaTransactionManager(prisma);
    const logger = new Logger('billing-test');

    connection = new RabbitMqConnection();
    publisher = new RabbitMqMessagePublisher(connection);
    publisher.onModuleInit();
    await publisher.whenReady();
    relay = new OutboxRelayService(prisma, publisher);

    const registry = new SagaMessageHandlerRegistry();
    new BillingCommandHandlers(
      registry,
      new CreateBudgetUseCase(budgets, outbox, transactions, logger),
      new CancelBudgetUseCase(budgets, outbox, transactions, logger),
    ).onModuleInit();
    consumer = new BillingCommandsConsumer(
      connection,
      publisher,
      registry,
      prisma,
    );
    approveBudget = new ApproveBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    );

    amqp = await connect(process.env.RABBITMQ_URL!);
    probe = await amqp.createChannel();
    await probe.assertQueue(CAPTURE_QUEUE, { exclusive: true });
    await probe.bindQueue(CAPTURE_QUEUE, 'saga.events', 'billing.#');
  });

  beforeEach(async () => {
    await prisma.cleanDatabase();
    await probe.purgeQueue(CAPTURE_QUEUE);
    await probe.purgeQueue(`${BILLING_COMMANDS_QUEUE}.retry.1`);
  });

  afterAll(async () => {
    await publisher.onModuleDestroy();
    await connection.onModuleDestroy();
    await amqp.close();
    await prisma.cleanDatabase();
    await prisma.onModuleDestroy();
  });

  const command = (
    type: string,
    payload: Record<string, unknown>,
    ids: { sagaId?: string; orderId?: string; messageId?: string } = {},
  ): SagaEnvelope => ({
    messageId: ids.messageId ?? randomUUID(),
    sagaId: ids.sagaId ?? randomUUID(),
    orderId: ids.orderId ?? randomUUID(),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    payload,
  });

  const delivery = (envelope: SagaEnvelope): ConsumeMessage => ({
    content: Buffer.from(JSON.stringify(envelope)),
    fields: {} as ConsumeMessage['fields'],
    properties: {
      messageId: envelope.messageId,
      headers: {},
    } as unknown as ConsumeMessage['properties'],
  });

  const budgetCreate = (totalAmount = '241.80') => ({
    orderNumber: 'OS2026000123',
    customer: { id: 'c-1', name: 'Maria Souza', email: 'maria@exemplo.com' },
    vehiclePlate: 'ABC1D23',
    services: [
      {
        serviceId: 'sv-1',
        name: 'Revisão de freios',
        unitPrice: '150.00',
        quantity: 1,
      },
    ],
    parts: [
      {
        partId: 'p-1',
        name: 'Pastilha de freio',
        unitPrice: '45.90',
        quantity: 2,
      },
    ],
    totalAmount,
  });

  const nextEvent = async (): Promise<GetMessage> => {
    for (let i = 0; i < 50; i++) {
      const msg = await probe.get(CAPTURE_QUEUE, { noAck: true });
      if (msg) return msg;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('No billing event published');
  };

  const publishedEvent = async (): Promise<SagaEnvelope> => {
    expect(await relay.publishPending()).toBeGreaterThanOrEqual(1);
    return JSON.parse((await nextEvent()).content.toString()) as SagaEnvelope;
  };

  it('billing.budget.create: grava o orçamento e publica billing.budget.created', async () => {
    const create = command('billing.budget.create', budgetCreate());

    expect(await consumer.handle(delivery(create))).toBe('processed');

    const budget = await prisma.budget.findUniqueOrThrow({
      where: { sagaId: create.sagaId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    expect(budget).toMatchObject({
      orderId: create.orderId,
      status: 'AWAITING_APPROVAL',
      customerEmail: 'maria@exemplo.com',
    });
    expect(budget.totalAmount.toFixed(2)).toBe('241.80');
    expect(budget.items.map((i) => [i.kind, i.name, i.quantity])).toEqual([
      ['SERVICE', 'Revisão de freios', 1],
      ['PART', 'Pastilha de freio', 2],
    ]);

    const event = await publishedEvent();
    expect(event).toMatchObject({
      type: 'billing.budget.created',
      sagaId: create.sagaId,
      orderId: create.orderId,
      payload: { budgetId: budget.id, totalAmount: '241.80' },
    });
  });

  it('o mesmo comando duas vezes cria um orçamento só', async () => {
    const create = delivery(command('billing.budget.create', budgetCreate()));
    expect(await consumer.handle(create)).toBe('processed');
    expect(await consumer.handle(create)).toBe('duplicate');
    expect(await prisma.budget.count()).toBe(1);
  });

  it('total que não bate: publica billing.budget.creation-failed', async () => {
    const create = command('billing.budget.create', budgetCreate('999.99'));
    expect(await consumer.handle(delivery(create))).toBe('processed');

    expect(await prisma.budget.count()).toBe(0);
    expect(await publishedEvent()).toMatchObject({
      type: 'billing.budget.creation-failed',
      sagaId: create.sagaId,
      payload: { reason: 'TOTAL_MISMATCH' },
    });
  });

  it('aprovação do cliente publica billing.budget.approved', async () => {
    const create = command('billing.budget.create', budgetCreate());
    await consumer.handle(delivery(create));
    await relay.publishPending();
    await nextEvent();
    const { id } = await prisma.budget.findUniqueOrThrow({
      where: { sagaId: create.sagaId },
    });

    const result = await approveBudget.execute(id, {
      id: 'c-1',
      role: TokenRole.CUSTOMER,
    });

    expect(result.status).toBe('APPROVED');
    expect(await publishedEvent()).toMatchObject({
      type: 'billing.budget.approved',
      sagaId: create.sagaId,
      payload: { budgetId: id, approvedBy: 'c-1', approvedByRole: 'CUSTOMER' },
    });
  });

  it('billing.budget.cancel: cancela e responde billing.budget.canceled', async () => {
    const create = command('billing.budget.create', budgetCreate());
    await consumer.handle(delivery(create));
    await relay.publishPending();
    await nextEvent();

    const cancel = command(
      'billing.budget.cancel',
      { reason: 'PAYMENT_TIMEOUT' },
      { sagaId: create.sagaId, orderId: create.orderId },
    );
    expect(await consumer.handle(delivery(cancel))).toBe('processed');

    const budget = await prisma.budget.findUniqueOrThrow({
      where: { sagaId: create.sagaId },
    });
    expect(budget).toMatchObject({
      status: 'CANCELED',
      cancelReason: 'PAYMENT_TIMEOUT',
    });
    expect(await publishedEvent()).toMatchObject({
      type: 'billing.budget.canceled',
      payload: { budgetId: budget.id, reason: 'PAYMENT_TIMEOUT' },
    });
  });

  it('comando sem tratador vai para a DLQ, sem efeito', async () => {
    const unknown = command('billing.payment.unknown', {});
    expect(await consumer.handle(delivery(unknown))).toBe('rejected');
    expect(await prisma.outboxMessage.count()).toBe(0);
  });
});
