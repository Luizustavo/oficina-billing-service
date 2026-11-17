import { BudgetEntity } from '@domain/entities/budget/budget.entity';
import {
  buildSagaEvent,
  OutgoingMessage,
  SagaEnvelope,
} from '@domain/messaging/saga-message';
import { randomUUID } from 'node:crypto';

type SagaRef = Pick<SagaEnvelope, 'sagaId' | 'orderId'>;

const event = (
  command: SagaRef,
  type: string,
  payload: Record<string, unknown>,
): OutgoingMessage =>
  buildSagaEvent({
    messageId: randomUUID(),
    command,
    type,
    occurredAt: new Date(),
    payload,
  });

const sagaOf = (budget: BudgetEntity): SagaRef => ({
  sagaId: budget.sagaId,
  orderId: budget.orderId,
});

export const BudgetEvents = {
  created: (budget: BudgetEntity): OutgoingMessage =>
    event(sagaOf(budget), 'billing.budget.created', {
      budgetId: budget.id,
      totalAmount: budget.totalAmount.toDecimalString(),
    }),

  creationFailed: (
    command: SagaRef,
    reason: string,
    detail: string,
  ): OutgoingMessage =>
    event(command, 'billing.budget.creation-failed', { reason, detail }),

  approved: (budget: BudgetEntity): OutgoingMessage =>
    event(sagaOf(budget), 'billing.budget.approved', {
      budgetId: budget.id,
      approvedBy: budget.decidedBy,
      approvedByRole: budget.decidedByRole,
      approvedAt: budget.decidedAt?.toISOString(),
    }),

  rejected: (budget: BudgetEntity): OutgoingMessage =>
    event(sagaOf(budget), 'billing.budget.rejected', {
      budgetId: budget.id,
      rejectedBy: budget.decidedBy,
      reason: budget.decisionNote,
      rejectedAt: budget.decidedAt?.toISOString(),
    }),

  canceled: (
    command: SagaRef,
    budget: BudgetEntity | null,
    reason: string,
  ): OutgoingMessage =>
    event(command, 'billing.budget.canceled', {
      budgetId: budget?.id ?? null,
      reason,
    }),
};
