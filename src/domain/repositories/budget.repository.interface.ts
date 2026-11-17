import { BudgetEntity } from '@domain/entities/budget/budget.entity';

export abstract class IBudgetRepository {
  abstract create(budget: BudgetEntity): Promise<BudgetEntity>;
  abstract update(budget: BudgetEntity): Promise<BudgetEntity>;
  abstract findById(id: string): Promise<BudgetEntity | null>;
  abstract findBySagaId(sagaId: string): Promise<BudgetEntity | null>;
  abstract findCurrentByOrderId(orderId: string): Promise<BudgetEntity | null>;
}
