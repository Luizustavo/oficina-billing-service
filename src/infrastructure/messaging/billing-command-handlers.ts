import { CreateBudgetUseCase } from '@application/use-cases/budget/create-budget.use-case';
import { CancelBudgetUseCase } from '@application/use-cases/budget/cancel-budget.use-case';
import { SagaMessageHandlerRegistry } from './saga-message-handler.registry';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class BillingCommandHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SagaMessageHandlerRegistry,
    private readonly createBudget: CreateBudgetUseCase,
    private readonly cancelBudget: CancelBudgetUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      type: 'billing.budget.create',
      versions: [1],
      handle: (command) => this.createBudget.execute(command),
    });
    this.registry.register({
      type: 'billing.budget.cancel',
      versions: [1],
      handle: (command) => this.cancelBudget.execute(command),
    });
  }
}
