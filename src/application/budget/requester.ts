import { NotFoundException } from '@shared/exceptions/domain.exceptions';
import { BudgetEntity } from '@domain/entities/budget/budget.entity';
import { TokenRole } from '@domain/enums/token-role.enum';

export interface Requester {
  id: string;
  role: TokenRole;
}

/** Orçamento de outro cliente devolve o mesmo erro de orçamento inexistente. */
export function assertCanAccess(
  budget: BudgetEntity | null,
  requester: Requester,
  lookupId: string,
): BudgetEntity {
  if (
    !budget ||
    (requester.role === TokenRole.CUSTOMER && !budget.isOwnedBy(requester.id))
  ) {
    throw new NotFoundException('Budget', lookupId);
  }
  return budget;
}
