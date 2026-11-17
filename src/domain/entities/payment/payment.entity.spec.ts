import { Money } from '@domain/value-objects/money.value-object';
import { PaymentStatus } from '@domain/enums/payment.enum';
import { PaymentEntity } from './payment.entity';

const makePayment = () =>
  PaymentEntity.create(
    {
      budgetId: 'b-1',
      orderId: 'o-1',
      sagaId: 's-1',
      customerId: 'c-1',
      amount: Money.fromDecimalString('241.80'),
      mpPreferenceId: 'pref-1',
      checkoutUrl: 'https://mp/checkout',
      sandboxCheckoutUrl: 'https://sandbox.mp/checkout',
    },
    'pay-1',
  );

const paidAt = new Date('2026-11-17T12:00:00Z');

describe('PaymentEntity', () => {
  it('nasce pendente, com o link do checkout', () => {
    const payment = makePayment();
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payment.checkoutUrl).toBe('https://mp/checkout');
    expect(payment.amount.toDecimalString()).toBe('241.80');
  });

  it('confirma uma vez só', () => {
    const payment = makePayment();
    expect(payment.confirm('mp-1', paidAt)).toBe(true);
    expect(payment.status).toBe(PaymentStatus.APPROVED);
    expect(payment.mpPaymentId).toBe('mp-1');
    expect(payment.paidAt).toEqual(paidAt);
    expect(payment.confirm('mp-1', paidAt)).toBe(false);
  });

  it('confirma pagamento que chegou depois de o checkout expirar', () => {
    const payment = makePayment();
    payment.expire();
    expect(payment.confirm('mp-1', paidAt)).toBe(true);
    expect(payment.status).toBe(PaymentStatus.APPROVED);
  });

  it.each([
    ['REJECTED', PaymentStatus.REJECTED],
    ['CANCELLED', PaymentStatus.CANCELLED],
  ] as const)('recusa com motivo %s', (reason, status) => {
    const payment = makePayment();
    expect(payment.fail('mp-1', reason, 'cc_rejected_other_reason')).toBe(true);
    expect(payment.status).toBe(status);
    expect(payment.failureReason).toBe(reason);
    expect(payment.failureDetail).toBe('cc_rejected_other_reason');
  });

  it('recusa que chega depois da aprovação não desfaz o pagamento', () => {
    const payment = makePayment();
    payment.confirm('mp-1', paidAt);
    expect(payment.fail('mp-1', 'REJECTED')).toBe(false);
    expect(payment.status).toBe(PaymentStatus.APPROVED);
  });

  it('expira só se ainda estiver pendente', () => {
    const payment = makePayment();
    expect(payment.expire()).toBe(true);
    expect(payment.expire()).toBe(false);
  });

  it('estorna um pagamento aprovado, uma vez só', () => {
    const payment = makePayment();
    payment.confirm('mp-1', paidAt);
    expect(payment.markRefunded('rf-1', paidAt)).toBe(true);
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(payment.mpRefundId).toBe('rf-1');
    expect(payment.markRefunded('rf-1', paidAt)).toBe(false);
  });

  it('não estorna o que não foi pago', () => {
    expect(makePayment().markRefunded('rf-1', paidAt)).toBe(false);
  });

  it('registra estorno recusado', () => {
    const payment = makePayment();
    payment.confirm('mp-1', paidAt);
    expect(payment.markRefundFailed('saldo insuficiente')).toBe(true);
    expect(payment.status).toBe(PaymentStatus.REFUND_FAILED);
    expect(payment.markRefundFailed('de novo')).toBe(false);
  });

  it('sabe de qual cliente é', () => {
    expect(makePayment().isOwnedBy('c-1')).toBe(true);
    expect(makePayment().isOwnedBy('c-2')).toBe(false);
  });
});
