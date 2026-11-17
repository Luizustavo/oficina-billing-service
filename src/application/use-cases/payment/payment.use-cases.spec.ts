import {
  PaymentGatewayUnavailableException,
  PaymentGatewayRejectedException,
  NotFoundException,
} from '@shared/exceptions/domain.exceptions';
import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { HandlePaymentNotificationUseCase } from './handle-payment-notification.use-case';
import { actionForMercadoPagoStatus } from '@application/payment/mercado-pago-status';
import { IIdempotencyStore } from '@domain/services/idempotency-store.interface';
import { IDistributedLock } from '@domain/services/distributed-lock.interface';
import { IPaymentGateway } from '@domain/services/payment-gateway.interface';
import { PaymentEntity } from '@domain/entities/payment/payment.entity';
import { OutgoingMessage, SagaEnvelope } from '@domain/messaging/saga-message';
import { Money } from '@domain/value-objects/money.value-object';
import { GetOrderPaymentUseCase } from './get-order-payment.use-case';
import { RefundPaymentUseCase } from './refund-payment.use-case';
import { PaymentStatus } from '@domain/enums/payment.enum';
import { TokenRole } from '@domain/enums/token-role.enum';
import { Logger } from '@nestjs/common';

const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;
const transactions: ITransactionManager = {
  run: (fn) => fn(),
  afterCommit: (fn) => void fn(),
};
const lock: IDistributedLock = { run: (_key, _ttl, fn) => fn() };

const makePayment = () =>
  PaymentEntity.create(
    {
      budgetId: 'b-1',
      orderId: 'o-1',
      sagaId: 's-1',
      customerId: 'c-1',
      amount: Money.fromDecimalString('241.80'),
      mpPreferenceId: 'pref-1',
      checkoutUrl: 'https://mp/checkout/pref-1',
    },
    'pay-1',
  );

function setup(payment: PaymentEntity | null) {
  const payments = {
    create: jest.fn(),
    update: jest.fn((p: PaymentEntity) => Promise.resolve(p)),
    findById: jest.fn(),
    findByBudgetId: jest.fn().mockResolvedValue(payment),
    findBySagaId: jest.fn().mockResolvedValue(payment),
    findCurrentByOrderId: jest.fn().mockResolvedValue(payment),
  } as jest.Mocked<IPaymentRepository>;
  const published: OutgoingMessage[] = [];
  const outbox: IOutboxRepository = {
    add: (messages) => {
      published.push(...messages);
      return Promise.resolve();
    },
  };
  const gateway = {
    createCheckout: jest.fn(),
    getPayment: jest.fn(),
    refund: jest.fn(),
    expireCheckout: jest.fn(),
  } as jest.Mocked<IPaymentGateway>;
  const seen = new Set<string>();
  const idempotency: IIdempotencyStore = {
    seen: (key) => Promise.resolve(seen.has(key)),
    remember: (key) => {
      seen.add(key);
      return Promise.resolve();
    },
  };
  const notification = new HandlePaymentNotificationUseCase(
    payments,
    outbox,
    gateway,
    idempotency,
    lock,
    transactions,
    logger,
  );
  return { payments, gateway, outbox, published, notification, seen };
}

const remote = (status: string, statusDetail?: string) => ({
  mpPaymentId: 'mp-1',
  status,
  statusDetail,
  budgetId: 'b-1',
  orderId: 'o-1',
  amount: Money.fromDecimalString('241.80'),
  approvedAt: new Date('2026-11-17T12:00:00Z'),
});

const refundCommand: SagaEnvelope = {
  messageId: 'm-1',
  sagaId: 's-1',
  orderId: 'o-1',
  type: 'billing.payment.refund',
  version: 1,
  occurredAt: new Date().toISOString(),
  payload: { reason: 'EXECUTION_FAILED' },
};

describe('actionForMercadoPagoStatus', () => {
  it.each([
    ['approved', { kind: 'confirm' }],
    ['rejected', { kind: 'fail', reason: 'REJECTED' }],
    ['cancelled', { kind: 'fail', reason: 'CANCELLED' }],
    ['pending', { kind: 'ignore' }],
    ['in_process', { kind: 'ignore' }],
    ['refunded', { kind: 'ignore' }],
  ])('%s → %o', (status, action) => {
    expect(actionForMercadoPagoStatus(status)).toEqual(action);
  });
});

describe('HandlePaymentNotificationUseCase', () => {
  it('aprovado: confirma e publica billing.payment.confirmed', async () => {
    const payment = makePayment();
    const { gateway, notification, published, payments } = setup(payment);
    gateway.getPayment.mockResolvedValue(remote('approved'));

    expect(await notification.execute('mp-1')).toBe('processed');

    expect(payment.status).toBe(PaymentStatus.APPROVED);
    expect(payments.update).toHaveBeenCalledWith(payment);
    expect(published[0]).toMatchObject({
      routingKey: 'billing.payment.confirmed',
      envelope: {
        sagaId: 's-1',
        orderId: 'o-1',
        payload: {
          paymentId: 'pay-1',
          mpPaymentId: 'mp-1',
          amount: '241.80',
          paidAt: '2026-11-17T12:00:00.000Z',
        },
      },
    });
  });

  it('recusado: publica billing.payment.failed com o detalhe do Mercado Pago', async () => {
    const { gateway, notification, published } = setup(makePayment());
    gateway.getPayment.mockResolvedValue(
      remote('rejected', 'cc_rejected_other_reason'),
    );

    await notification.execute('mp-1');

    expect(published[0]).toMatchObject({
      routingKey: 'billing.payment.failed',
      envelope: {
        payload: {
          paymentId: 'pay-1',
          reason: 'REJECTED',
          detail: 'cc_rejected_other_reason',
        },
      },
    });
  });

  it('a mesma notificação de novo não publica outra vez', async () => {
    const { gateway, notification, published } = setup(makePayment());
    gateway.getPayment.mockResolvedValue(remote('approved'));

    expect(await notification.execute('mp-1')).toBe('processed');
    expect(await notification.execute('mp-1')).toBe('duplicate');
    expect(published).toHaveLength(1);
  });

  it('sem o Redis lembrar, o banco ainda segura a duplicata', async () => {
    const payment = makePayment();
    const { gateway, notification, published, seen } = setup(payment);
    gateway.getPayment.mockResolvedValue(remote('approved'));

    await notification.execute('mp-1');
    seen.clear();
    expect(await notification.execute('mp-1')).toBe('duplicate');
    expect(published).toHaveLength(1);
  });

  it('pendente: não faz nada', async () => {
    const { gateway, notification, published } = setup(makePayment());
    gateway.getPayment.mockResolvedValue(remote('in_process'));
    expect(await notification.execute('mp-1')).toBe('ignored');
    expect(published).toHaveLength(0);
  });

  it('pagamento que não veio de um orçamento nosso: ignora', async () => {
    const { gateway, notification } = setup(makePayment());
    gateway.getPayment.mockResolvedValue({
      ...remote('approved'),
      budgetId: undefined,
    });
    expect(await notification.execute('mp-1')).toBe('ignored');
  });

  it('orçamento sem pagamento registrado: não publica', async () => {
    const { gateway, notification, published } = setup(null);
    gateway.getPayment.mockResolvedValue(remote('approved'));
    expect(await notification.execute('mp-1')).toBe('duplicate');
    expect(published).toHaveLength(0);
  });
});

describe('RefundPaymentUseCase', () => {
  const approvedPayment = () => {
    const payment = makePayment();
    payment.confirm('mp-1', new Date());
    return payment;
  };

  it('estorna no Mercado Pago com a chave do pagamento e publica refunded', async () => {
    const payment = approvedPayment();
    const { gateway, outbox, payments, published } = setup(payment);
    gateway.refund.mockResolvedValue({
      refundId: 'rf-1',
      amount: Money.fromDecimalString('241.80'),
      refundedAt: new Date('2026-11-17T13:00:00Z'),
    });

    await new RefundPaymentUseCase(
      payments,
      outbox,
      gateway,
      transactions,
      logger,
    ).execute(refundCommand);

    expect(gateway.refund).toHaveBeenCalledWith('mp-1', 'pay-1');
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(published[0]).toMatchObject({
      routingKey: 'billing.payment.refunded',
      envelope: {
        payload: {
          paymentId: 'pay-1',
          mpRefundId: 'rf-1',
          amount: '241.80',
          refundedAt: '2026-11-17T13:00:00.000Z',
        },
      },
    });
  });

  it('já estornado: só responde de novo', async () => {
    const payment = approvedPayment();
    payment.markRefunded('rf-1', new Date());
    const { gateway, outbox, payments, published } = setup(payment);

    await new RefundPaymentUseCase(
      payments,
      outbox,
      gateway,
      transactions,
      logger,
    ).execute(refundCommand);

    expect(gateway.refund).not.toHaveBeenCalled();
    expect(published[0].routingKey).toBe('billing.payment.refunded');
  });

  it.each([
    ['sem pagamento', null],
    ['pagamento pendente', makePayment()],
  ])('%s: responde refund-failed', async (_label, payment) => {
    const { gateway, outbox, payments, published } = setup(payment);

    await new RefundPaymentUseCase(
      payments,
      outbox,
      gateway,
      transactions,
      logger,
    ).execute(refundCommand);

    expect(gateway.refund).not.toHaveBeenCalled();
    expect(published[0]).toMatchObject({
      routingKey: 'billing.payment.refund-failed',
      envelope: { payload: { detail: 'No approved payment for this saga' } },
    });
  });

  it('Mercado Pago recusou o estorno: refund-failed e status registrado', async () => {
    const payment = approvedPayment();
    const { gateway, outbox, payments, published } = setup(payment);
    gateway.refund.mockRejectedValue(
      new PaymentGatewayRejectedException('insufficient_amount'),
    );

    await new RefundPaymentUseCase(
      payments,
      outbox,
      gateway,
      transactions,
      logger,
    ).execute(refundCommand);

    expect(payment.status).toBe(PaymentStatus.REFUND_FAILED);
    expect(published[0]).toMatchObject({
      routingKey: 'billing.payment.refund-failed',
      envelope: {
        payload: { paymentId: 'pay-1', detail: 'insufficient_amount' },
      },
    });
  });

  it('Mercado Pago fora do ar: o erro sobe para a retentativa', async () => {
    const { gateway, outbox, payments, published } = setup(approvedPayment());
    gateway.refund.mockRejectedValue(
      new PaymentGatewayUnavailableException('timeout'),
    );

    await expect(
      new RefundPaymentUseCase(
        payments,
        outbox,
        gateway,
        transactions,
        logger,
      ).execute(refundCommand),
    ).rejects.toBeInstanceOf(PaymentGatewayUnavailableException);
    expect(published).toHaveLength(0);
  });
});

describe('GetOrderPaymentUseCase', () => {
  it('o dono vê o pagamento', async () => {
    const { payments } = setup(makePayment());
    await expect(
      new GetOrderPaymentUseCase(payments, logger).execute('o-1', {
        id: 'c-1',
        role: TokenRole.CUSTOMER,
      }),
    ).resolves.toMatchObject({
      id: 'pay-1',
      amount: '241.80',
      status: 'PENDING',
    });
  });

  it('a equipe vê qualquer pagamento', async () => {
    const { payments } = setup(makePayment());
    await expect(
      new GetOrderPaymentUseCase(payments, logger).execute('o-1', {
        id: 'u-1',
        role: TokenRole.ADMIN,
      }),
    ).resolves.toMatchObject({ id: 'pay-1' });
  });

  it.each([
    ['de outro cliente', makePayment()],
    ['inexistente', null],
  ])('pagamento %s: 404', async (_label, payment) => {
    const { payments } = setup(payment);
    await expect(
      new GetOrderPaymentUseCase(payments, logger).execute('o-1', {
        id: 'c-2',
        role: TokenRole.CUSTOMER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
