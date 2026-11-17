import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { IPaymentGateway } from '@domain/services/payment-gateway.interface';
import { BudgetEntity } from '@domain/entities/budget/budget.entity';
import { BudgetEvents } from '@application/budget/budget-events';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CancelBudgetUseCase {
  constructor(
    private readonly budgets: IBudgetRepository,
    private readonly payments: IPaymentRepository,
    private readonly outbox: IOutboxRepository,
    private readonly gateway: IPaymentGateway,
    private readonly transactions: ITransactionManager,
    private readonly logger: Logger,
  ) {}

  async execute(command: SagaEnvelope): Promise<void> {
    const reason =
      typeof command.payload.reason === 'string'
        ? command.payload.reason
        : 'UNSPECIFIED';
    this.logger.log(
      `Canceling budget of order ${command.orderId} (saga ${command.sagaId}): ${reason}`,
    );

    await this.transactions.run(async () => {
      const budget = await this.budgets.findBySagaId(command.sagaId);
      if (!budget) {
        this.logger.warn(
          `No budget for saga ${command.sagaId}; confirming the cancellation anyway`,
        );
      } else {
        if (budget.cancel(reason)) {
          await this.budgets.update(budget);
        }
        await this.expirePendingCheckout(budget);
      }
      await this.outbox.add([BudgetEvents.canceled(command, budget, reason)]);
      this.logger.log(`Budget of saga ${command.sagaId} is canceled`);
    });
  }

  private async expirePendingCheckout(budget: BudgetEntity): Promise<void> {
    const payment = await this.payments.findByBudgetId(budget.id);
    if (!payment?.expire()) return;

    await this.payments.update(payment);
    try {
      await this.gateway.expireCheckout(payment.mpPreferenceId);
    } catch (error) {
      // O pagamento já está EXPIRED aqui; um pagamento que ainda entrar vira estorno (LATE_PAYMENT).
      this.logger.warn(
        `Could not expire checkout ${payment.mpPreferenceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
