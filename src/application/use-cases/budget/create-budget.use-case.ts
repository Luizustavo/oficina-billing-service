import { InvalidBudgetException } from '@shared/exceptions/domain.exceptions';
import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { parseBudgetCreatePayload } from '@application/budget/budget-create-payload';
import { BudgetEntity } from '@domain/entities/budget/budget.entity';
import { BudgetEvents } from '@application/budget/budget-events';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class CreateBudgetUseCase {
  constructor(
    private readonly budgets: IBudgetRepository,
    private readonly outbox: IOutboxRepository,
    private readonly transactions: ITransactionManager,
    private readonly logger: Logger,
  ) {}

  async execute(command: SagaEnvelope): Promise<void> {
    this.logger.log(
      `Creating budget for order ${command.orderId} (saga ${command.sagaId})`,
    );

    await this.transactions.run(async () => {
      const existing = await this.budgets.findBySagaId(command.sagaId);
      if (existing) {
        this.logger.warn(
          `Budget ${existing.id} already exists for saga ${command.sagaId}, answering again`,
        );
        await this.outbox.add([BudgetEvents.created(existing)]);
        return;
      }

      try {
        const data = parseBudgetCreatePayload(command.payload);
        const budget = await this.budgets.create(
          BudgetEntity.create(
            { ...data, orderId: command.orderId, sagaId: command.sagaId },
            randomUUID(),
          ),
        );
        await this.outbox.add([BudgetEvents.created(budget)]);
        this.logger.log(
          `Budget ${budget.id} created for order ${command.orderId}: ${budget.totalAmount.toDecimalString()}`,
        );
      } catch (error) {
        if (!(error instanceof InvalidBudgetException)) throw error;
        this.logger.warn(
          `Budget for order ${command.orderId} could not be created: ${error.message}`,
        );
        await this.outbox.add([
          BudgetEvents.creationFailed(command, error.reason, error.message),
        ]);
      }
    });
  }
}
