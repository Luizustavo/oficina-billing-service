import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { actionForMercadoPagoStatus } from '@application/payment/mercado-pago-status';
import { IIdempotencyStore } from '@domain/services/idempotency-store.interface';
import { IDistributedLock } from '@domain/services/distributed-lock.interface';
import { IPaymentGateway } from '@domain/services/payment-gateway.interface';
import { PaymentEvents } from '@application/payment/payment-events';
import { Injectable, Logger } from '@nestjs/common';

export type NotificationOutcome = 'processed' | 'duplicate' | 'ignored';

const ONE_DAY_SECONDS = 86_400;
const LOCK_TTL_MS = 30_000;

@Injectable()
export class HandlePaymentNotificationUseCase {
  constructor(
    private readonly payments: IPaymentRepository,
    private readonly outbox: IOutboxRepository,
    private readonly gateway: IPaymentGateway,
    private readonly idempotency: IIdempotencyStore,
    private readonly lock: IDistributedLock,
    private readonly transactions: ITransactionManager,
    private readonly logger: Logger,
  ) {}

  async execute(mpPaymentId: string): Promise<NotificationOutcome> {
    this.logger.log(
      `Handling Mercado Pago notification for payment ${mpPaymentId}`,
    );

    const remote = await this.gateway.getPayment(mpPaymentId);
    const key = `mp:webhook:${mpPaymentId}:${remote.status}`;
    if (await this.idempotency.seen(key)) {
      this.logger.log(`Notification ${key} already handled`);
      return 'duplicate';
    }

    const action = actionForMercadoPagoStatus(remote.status);
    if (action.kind === 'ignore' || !remote.budgetId) {
      this.logger.log(
        `Mercado Pago payment ${mpPaymentId} is ${remote.status}, nothing to do`,
      );
      return 'ignored';
    }

    const budgetId = remote.budgetId;
    const changed = await this.lock.run(
      `lock:order:${remote.orderId ?? budgetId}`,
      LOCK_TTL_MS,
      () =>
        this.transactions.run(async () => {
          const payment = await this.payments.findByBudgetId(budgetId);
          if (!payment) {
            this.logger.warn(`No payment for budget ${budgetId}`);
            return false;
          }
          const applied =
            action.kind === 'confirm'
              ? payment.confirm(mpPaymentId, remote.approvedAt ?? new Date())
              : payment.fail(mpPaymentId, action.reason, remote.statusDetail);
          if (!applied) return false;

          const saved = await this.payments.update(payment);
          await this.outbox.add([
            action.kind === 'confirm'
              ? PaymentEvents.confirmed(saved)
              : PaymentEvents.failed(saved, action.reason, remote.statusDetail),
          ]);
          return true;
        }),
    );

    await this.idempotency.remember(key, ONE_DAY_SECONDS);
    this.logger.log(
      `Payment ${mpPaymentId} (${remote.status}) ${changed ? 'applied' : 'already applied'}`,
    );
    return changed ? 'processed' : 'duplicate';
  }
}
