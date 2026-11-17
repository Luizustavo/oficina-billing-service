export enum BudgetStatus {
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
}

export enum BudgetItemKind {
  SERVICE = 'SERVICE',
  PART = 'PART',
}

export type BudgetCreationFailure =
  | 'INVALID_PAYLOAD'
  | 'INVALID_ITEMS'
  | 'TOTAL_MISMATCH';
