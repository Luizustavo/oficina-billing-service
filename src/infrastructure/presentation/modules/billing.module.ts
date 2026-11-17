import { GetOrderBudgetUseCase } from '@application/use-cases/budget/get-order-budget.use-case';
import { ApproveBudgetUseCase } from '@application/use-cases/budget/approve-budget.use-case';
import { RejectBudgetUseCase } from '@application/use-cases/budget/reject-budget.use-case';
import { CreateBudgetUseCase } from '@application/use-cases/budget/create-budget.use-case';
import { CancelBudgetUseCase } from '@application/use-cases/budget/cancel-budget.use-case';
import { PrismaTransactionManager } from '@infrastructure/database/prisma/prisma-transaction-manager';
import { BudgetsController } from '@infrastructure/presentation/controllers/budgets.controller';
import { BudgetRepository } from '@infrastructure/database/prisma/repositories/budget.repository';
import { OutboxRepository } from '@infrastructure/database/prisma/repositories/outbox.repository';
import { BillingCommandHandlers } from '@infrastructure/messaging/billing-command-handlers';
import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { Logger, Module } from '@nestjs/common';

@Module({
  controllers: [BudgetsController],
  providers: [
    Logger,
    CreateBudgetUseCase,
    CancelBudgetUseCase,
    GetOrderBudgetUseCase,
    ApproveBudgetUseCase,
    RejectBudgetUseCase,
    BillingCommandHandlers,
    { provide: IBudgetRepository, useClass: BudgetRepository },
    { provide: IOutboxRepository, useClass: OutboxRepository },
    { provide: ITransactionManager, useClass: PrismaTransactionManager },
  ],
})
export class BudgetsModule {}
