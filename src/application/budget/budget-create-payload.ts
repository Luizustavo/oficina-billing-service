import { InvalidBudgetException } from '@shared/exceptions/domain.exceptions';
import {
  BudgetCustomer,
  BudgetItem,
} from '@domain/entities/budget/budget.entity';
import { Money } from '@domain/value-objects/money.value-object';
import { BudgetItemKind } from '@domain/enums/budget.enum';

export interface BudgetCreateCommand {
  orderNumber: string;
  customer: BudgetCustomer;
  vehiclePlate: string;
  items: BudgetItem[];
  declaredTotal: Money;
}

type Raw = Record<string, unknown>;

const invalid = (detail: string): never => {
  throw new InvalidBudgetException('INVALID_PAYLOAD', detail);
};

const text = (source: Raw, field: string): string => {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    return invalid(`Field "${field}" is missing`);
  }
  return value;
};

const money = (source: Raw, field: string): Money => {
  try {
    return Money.fromDecimalString(text(source, field));
  } catch {
    return invalid(`Field "${field}" is not a 2-decimal amount`);
  }
};

const object = (value: unknown, field: string): Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Raw)
    : invalid(`Field "${field}" is not an object`);

const list = (source: Raw, field: string): Raw[] => {
  const value = source[field] ?? [];
  if (!Array.isArray(value)) {
    return invalid(`Field "${field}" is not a list`);
  }
  return value.map((item, index) => object(item, `${field}[${index}]`));
};

const items = (
  source: Raw,
  field: 'services' | 'parts',
  kind: BudgetItemKind,
  refField: 'serviceId' | 'partId',
): BudgetItem[] =>
  list(source, field).map((item) => ({
    kind,
    refId: text(item, refField),
    name: text(item, 'name'),
    unitPrice: money(item, 'unitPrice'),
    quantity: Number(item.quantity),
  }));

/** Payload de `billing.budget.create` (contratos-de-mensagens.md, seção 5). */
export function parseBudgetCreatePayload(payload: Raw): BudgetCreateCommand {
  const customer = object(payload.customer, 'customer');
  return {
    orderNumber: text(payload, 'orderNumber'),
    customer: {
      id: text(customer, 'id'),
      name: text(customer, 'name'),
      email: text(customer, 'email'),
    },
    vehiclePlate: text(payload, 'vehiclePlate'),
    items: [
      ...items(payload, 'services', BudgetItemKind.SERVICE, 'serviceId'),
      ...items(payload, 'parts', BudgetItemKind.PART, 'partId'),
    ],
    declaredTotal: money(payload, 'totalAmount'),
  };
}
