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
import { HandlePaymentNotificationUseCase } from '@application/use-cases/payment/handle-payment-notification.use-case';
import { PaymentRepository } from '@infrastructure/database/prisma/repositories/payment.repository';
import { RefundPaymentUseCase } from '@application/use-cases/payment/refund-payment.use-case';
import { RedisIdempotencyStore } from '@infrastructure/redis/redis-idempotency.store';
import { RedisDistributedLock } from '@infrastructure/redis/redis-distributed.lock';
import { IPaymentGateway } from '@domain/services/payment-gateway.interface';
import { Money } from '@domain/value-objects/money.value-object';
import { RedisClient } from '@infrastructure/redis/redis.client';
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
  let handleNotification: HandlePaymentNotificationUseCase;
  let redis: RedisClient;
  const gateway = {
    createCheckout: jest.fn(),
    getPayment: jest.fn(),
    refund: jest.fn(),
    expireCheckout: jest.fn(),
  } as jest.Mocked<IPaymentGateway>;
  let amqp: ChannelModel;
  let probe: Channel;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    const budgets = new BudgetRepository(prisma);
    const outbox = new OutboxRepository(prisma);
    const payments = new PaymentRepository(prisma);
    redis = new RedisClient();
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
      new CancelBudgetUseCase(
        budgets,
        payments,
        outbox,
        gateway,
        transactions,
        logger,
      ),
      new RefundPaymentUseCase(payments, outbox, gateway, transactions, logger),
    ).onModuleInit();
    consumer = new BillingCommandsConsumer(
      connection,
      publisher,
      registry,
      prisma,
    );
    approveBudget = new ApproveBudgetUseCase(
      budgets,
      payments,
      outbox,
      gateway,
      transactions,
      logger,
    );
    handleNotification = new HandlePaymentNotificationUseCase(
      payments,
      outbox,
      gateway,
      new RedisIdempotencyStore(redis),
      new RedisDistributedLock(redis),
      transactions,
      logger,
    );

    amqp = await connect(process.env.RABBITMQ_URL!);
    probe = await amqp.createChannel();
    await probe.assertQueue(CAPTURE_QUEUE, { exclusive: true });
    await probe.bindQueue(CAPTURE_QUEUE, 'saga.events', 'billing.#');
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    gateway.createCheckout.mockResolvedValue({
      preferenceId: 'pref-1',
      checkoutUrl: 'https://mp/checkout/pref-1',
    });
    await redis.connection.flushdb();
    await prisma.cleanDatabase();
    await probe.purgeQueue(CAPTURE_QUEUE);
    await probe.purgeQueue(`${BILLING_COMMANDS_QUEUE}.retry.1`);
  });

  afterAll(async () => {
    await publisher.onModuleDestroy();
    await connection.onModuleDestroy();
    await amqp.close();
    await redis.onModuleDestroy();
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

  describe('pagamento (Mercado Pago simulado, Redis de verdade)', () => {
    const approvedBudget = async () => {
      const create = command('billing.budget.create', budgetCreate());
      await consumer.handle(delivery(create));
      await relay.publishPending();
      await nextEvent();
      const { id } = await prisma.budget.findUniqueOrThrow({
        where: { sagaId: create.sagaId },
      });
      const approved = await approveBudget.execute(id, {
        id: 'c-1',
        role: TokenRole.CUSTOMER,
      });
      await relay.publishPending();
      await nextEvent();
      return { create, budgetId: id, approved };
    };

    const remotePayment = (
      status: string,
      budgetId: string,
      orderId: string,
    ) => ({
      mpPaymentId: 'mp-123',
      status,
      statusDetail:
        status === 'rejected' ? 'cc_rejected_other_reason' : 'accredited',
      budgetId,
      orderId,
      amount: Money.fromDecimalString('241.80'),
      approvedAt: new Date('2026-11-17T12:00:00Z'),
    });

    it('aprovação cria o pagamento pendente e devolve o link do checkout', async () => {
      const { budgetId, approved } = await approvedBudget();
      expect(approved.checkoutUrl).toBe('https://mp/checkout/pref-1');
      expect(gateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ budgetId }),
      );
      expect(
        await prisma.payment.findUniqueOrThrow({ where: { budgetId } }),
      ).toMatchObject({ status: 'PENDING', mpPreferenceId: 'pref-1' });
    });

    it('webhook aprovado: publica billing.payment.confirmed uma vez só', async () => {
      const { create, budgetId } = await approvedBudget();
      gateway.getPayment.mockResolvedValue(
        remotePayment('approved', budgetId, create.orderId),
      );

      expect(await handleNotification.execute('mp-123')).toBe('processed');
      expect(await handleNotification.execute('mp-123')).toBe('duplicate');

      expect(await redis.connection.exists('mp:webhook:mp-123:approved')).toBe(
        1,
      );
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { budgetId },
      });
      expect(payment).toMatchObject({
        status: 'APPROVED',
        mpPaymentId: 'mp-123',
      });
      expect(await publishedEvent()).toMatchObject({
        type: 'billing.payment.confirmed',
        sagaId: create.sagaId,
        payload: {
          paymentId: payment.id,
          mpPaymentId: 'mp-123',
          amount: '241.80',
        },
      });
      expect(await relay.publishPending()).toBe(0);
    });

    it('webhook recusado: publica billing.payment.failed', async () => {
      const { create, budgetId } = await approvedBudget();
      gateway.getPayment.mockResolvedValue(
        remotePayment('rejected', budgetId, create.orderId),
      );

      await handleNotification.execute('mp-123');

      expect(await publishedEvent()).toMatchObject({
        type: 'billing.payment.failed',
        payload: { reason: 'REJECTED', detail: 'cc_rejected_other_reason' },
      });
    });

    it('cancelamento expira o checkout pendente', async () => {
      const { create, budgetId } = await approvedBudget();
      await consumer.handle(
        delivery(
          command(
            'billing.budget.cancel',
            { reason: 'PAYMENT_TIMEOUT' },
            { sagaId: create.sagaId, orderId: create.orderId },
          ),
        ),
      );

      expect(gateway.expireCheckout).toHaveBeenCalledWith('pref-1');
      expect(
        await prisma.payment.findUniqueOrThrow({ where: { budgetId } }),
      ).toMatchObject({ status: 'EXPIRED' });
    });

    it('billing.payment.refund: estorna e publica billing.payment.refunded', async () => {
      const { create, budgetId } = await approvedBudget();
      gateway.getPayment.mockResolvedValue(
        remotePayment('approved', budgetId, create.orderId),
      );
      await handleNotification.execute('mp-123');
      await relay.publishPending();
      await nextEvent();
      gateway.refund.mockResolvedValue({
        refundId: 'rf-9',
        amount: Money.fromDecimalString('241.80'),
        refundedAt: new Date('2026-11-17T13:00:00Z'),
      });

      const refund = command(
        'billing.payment.refund',
        { reason: 'EXECUTION_FAILED' },
        { sagaId: create.sagaId, orderId: create.orderId },
      );
      expect(await consumer.handle(delivery(refund))).toBe('processed');

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { budgetId },
      });
      expect(gateway.refund).toHaveBeenCalledWith('mp-123', payment.id);
      expect(payment).toMatchObject({ status: 'REFUNDED', mpRefundId: 'rf-9' });
      expect(await publishedEvent()).toMatchObject({
        type: 'billing.payment.refunded',
        payload: {
          paymentId: payment.id,
          mpRefundId: 'rf-9',
          amount: '241.80',
        },
      });
    });
  });
});
