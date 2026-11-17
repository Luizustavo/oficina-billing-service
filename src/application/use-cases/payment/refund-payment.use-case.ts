import { PaymentGatewayRejectedException } from '@shared/exceptions/domain.exceptions';
import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { IPaymentGateway } from '@domain/services/payment-gateway.interface';
import { PaymentEvents } from '@application/payment/payment-events';
import { PaymentStatus } from '@domain/enums/payment.enum';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RefundPaymentUseCase {
  constructor(
    private readonly payments: IPaymentRepository,
    private readonly outbox: IOutboxRepository,
    private readonly gateway: IPaymentGateway,
    private readonly transactions: ITransactionManager,
    private readonly logger: Logger,
  ) {}

  async execute(command: SagaEnvelope): Promise<void> {
    this.logger.log(
      `Refunding payment of order ${command.orderId} (saga ${command.sagaId}): ${String(command.payload.reason)}`,
    );

    await this.transactions.run(async () => {
      const payment = await this.payments.findBySagaId(command.sagaId);

      if (payment?.status === PaymentStatus.REFUNDED) {
        this.logger.warn(
          `Payment ${payment.id} already refunded, answering again`,
        );
        await this.outbox.add([PaymentEvents.refunded(payment)]);
        return;
      }
      if (payment?.status !== PaymentStatus.APPROVED || !payment.mpPaymentId) {
        this.logger.warn(
          `No approved payment to refund for saga ${command.sagaId}`,
        );
        await this.outbox.add([
          PaymentEvents.refundFailed(
            command,
            payment?.id ?? null,
            'No approved payment for this saga',
          ),
        ]);
        return;
      }

      try {
        const refund = await this.gateway.refund(
          payment.mpPaymentId,
          payment.id,
        );
        payment.markRefunded(refund.refundId, refund.refundedAt);
        await this.outbox.add([
          PaymentEvents.refunded(await this.payments.update(payment)),
        ]);
        this.logger.log(`Payment ${payment.id} refunded (${refund.refundId})`);
      } catch (error) {
        if (!(error instanceof PaymentGatewayRejectedException)) throw error;
        this.logger.warn(
          `Refund of payment ${payment.id} rejected: ${error.message}`,
        );
        payment.markRefundFailed(error.message);
        await this.payments.update(payment);
        await this.outbox.add([
          PaymentEvents.refundFailed(command, payment.id, error.message),
        ]);
      }
    });
  }
}
