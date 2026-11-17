import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { BudgetEvents } from '@application/budget/budget-events';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CancelBudgetUseCase {
  constructor(
    private readonly budgets: IBudgetRepository,
    private readonly outbox: IOutboxRepository,
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
      } else if (budget.cancel(reason)) {
        await this.budgets.update(budget);
      }
      await this.outbox.add([BudgetEvents.canceled(command, budget, reason)]);
      this.logger.log(`Budget of saga ${command.sagaId} is canceled`);
    });
  }
}
