import {
  buildSagaEvent,
  OutgoingMessage,
  SagaEnvelope,
} from '@domain/messaging/saga-message';
import { PaymentFailureReason } from '@domain/enums/payment.enum';
import { PaymentEntity } from '@domain/entities/payment/payment.entity';
import { randomUUID } from 'crypto';

type SagaRef = Pick<SagaEnvelope, 'sagaId' | 'orderId'>;

const event = (
  saga: SagaRef,
  type: string,
  payload: Record<string, unknown>,
): OutgoingMessage =>
  buildSagaEvent({
    messageId: randomUUID(),
    command: saga,
    type,
    occurredAt: new Date(),
    payload,
  });

const sagaOf = (payment: PaymentEntity): SagaRef => ({
  sagaId: payment.sagaId,
  orderId: payment.orderId,
});

export const PaymentEvents = {
  confirmed: (payment: PaymentEntity): OutgoingMessage =>
    event(sagaOf(payment), 'billing.payment.confirmed', {
      paymentId: payment.id,
      mpPaymentId: payment.mpPaymentId,
      amount: payment.amount.toDecimalString(),
      paidAt: payment.paidAt?.toISOString(),
    }),

  failed: (
    payment: PaymentEntity,
    reason: PaymentFailureReason,
    detail?: string,
  ): OutgoingMessage =>
    event(sagaOf(payment), 'billing.payment.failed', {
      paymentId: payment.id,
      mpPaymentId: payment.mpPaymentId ?? null,
      reason,
      detail: detail ?? null,
    }),

  refunded: (payment: PaymentEntity): OutgoingMessage =>
    event(sagaOf(payment), 'billing.payment.refunded', {
      paymentId: payment.id,
      mpRefundId: payment.mpRefundId,
      amount: payment.amount.toDecimalString(),
      refundedAt: payment.refundedAt?.toISOString(),
    }),

  refundFailed: (
    saga: SagaRef,
    paymentId: string | null,
    detail: string,
  ): OutgoingMessage =>
    event(saga, 'billing.payment.refund-failed', { paymentId, detail }),
};
