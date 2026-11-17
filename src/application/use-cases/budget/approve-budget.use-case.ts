import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { assertCanAccess, Requester } from '@application/budget/requester';
import { BudgetResponseDto } from '@application/dtos/response/budget.dto';
import { BudgetEvents } from '@application/budget/budget-events';
import { BudgetMapper } from '@application/mappers/budget.mapper';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ApproveBudgetUseCase {
  constructor(
    private readonly budgets: IBudgetRepository,
    private readonly outbox: IOutboxRepository,
    private readonly transactions: ITransactionManager,
    private readonly logger: Logger,
  ) {}

  async execute(
    budgetId: string,
    requester: Requester,
  ): Promise<BudgetResponseDto> {
    this.logger.log(`Approving budget ${budgetId} (${requester.role})`);

    const approved = await this.transactions.run(async () => {
      const budget = assertCanAccess(
        await this.budgets.findById(budgetId),
        requester,
        budgetId,
      );
      budget.approve(requester.id, requester.role);
      const saved = await this.budgets.update(budget);
      await this.outbox.add([BudgetEvents.approved(saved)]);
      return saved;
    });

    this.logger.log(`Budget ${budgetId} approved`);
    const response: BudgetResponseDto = BudgetMapper.toResponse(approved);
    return response;
  }
}
