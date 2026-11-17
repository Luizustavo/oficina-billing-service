import {
  InvalidStatusTransitionException,
  InvalidBudgetException,
} from '@shared/exceptions/domain.exceptions';
import { BudgetItemKind, BudgetStatus } from '@domain/enums/budget.enum';
import { Money } from '@domain/value-objects/money.value-object';
import { TokenRole } from '@domain/enums/token-role.enum';

export interface BudgetItem {
  kind: BudgetItemKind;
  refId: string;
  name: string;
  unitPrice: Money;
  quantity: number;
}

export interface BudgetCustomer {
  id: string;
  name: string;
  email: string;
}

export interface BudgetProps {
  orderId: string;
  sagaId: string;
  orderNumber: string;
  customer: BudgetCustomer;
  vehiclePlate: string;
  items: BudgetItem[];
  totalAmount: Money;
  status: BudgetStatus;
  decidedBy?: string;
  decidedByRole?: TokenRole;
  decidedAt?: Date;
  decisionNote?: string;
  cancelReason?: string;
  canceledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetProps {
  orderId: string;
  sagaId: string;
  orderNumber: string;
  customer: BudgetCustomer;
  vehiclePlate: string;
  items: BudgetItem[];
  declaredTotal: Money;
}

export class BudgetEntity {
  private readonly props: BudgetProps;
  private _id = '';

  private constructor(props: BudgetProps, id?: string) {
    this.props = props;
    if (id) this._id = id;
  }

  static create(props: CreateBudgetProps, id?: string): BudgetEntity {
    if (props.items.length === 0) {
      throw new InvalidBudgetException(
        'INVALID_ITEMS',
        'Budget has no services or parts',
      );
    }
    const invalid = props.items.find(
      (item) => !Number.isInteger(item.quantity) || item.quantity <= 0,
    );
    if (invalid) {
      throw new InvalidBudgetException(
        'INVALID_ITEMS',
        `Invalid quantity for "${invalid.name}": ${invalid.quantity}`,
      );
    }

    const total = props.items.reduce(
      (sum, item) => sum.add(item.unitPrice.times(item.quantity)),
      Money.zero(),
    );
    if (!total.equals(props.declaredTotal)) {
      throw new InvalidBudgetException(
        'TOTAL_MISMATCH',
        `Declared total ${props.declaredTotal.toDecimalString()} differs from items total ${total.toDecimalString()}`,
      );
    }

    const now = new Date();
    return new BudgetEntity(
      {
        orderId: props.orderId,
        sagaId: props.sagaId,
        orderNumber: props.orderNumber,
        customer: props.customer,
        vehiclePlate: props.vehiclePlate,
        items: props.items,
        totalAmount: total,
        status: BudgetStatus.AWAITING_APPROVAL,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
  }

  static reconstitute(props: BudgetProps, id?: string): BudgetEntity {
    return new BudgetEntity(props, id);
  }

  ensureAwaitingApproval(): void {
    if (this.props.status !== BudgetStatus.AWAITING_APPROVAL) {
      throw new InvalidStatusTransitionException(
        this.props.status,
        BudgetStatus.APPROVED,
      );
    }
  }

  approve(by: string, role: TokenRole): void {
    this.decide(BudgetStatus.APPROVED, by, role);
  }

  reject(by: string, role: TokenRole, note?: string): void {
    this.decide(BudgetStatus.REJECTED, by, role, note);
  }

  /** Idempotente: cancelar de novo não muda nada e devolve `false`. */
  cancel(reason: string): boolean {
    if (this.props.status === BudgetStatus.CANCELED) {
      return false;
    }
    this.props.status = BudgetStatus.CANCELED;
    this.props.cancelReason = reason;
    this.props.canceledAt = new Date();
    this.props.updatedAt = new Date();
    return true;
  }

  isOwnedBy(customerId: string): boolean {
    return this.props.customer.id === customerId;
  }

  private decide(
    status: BudgetStatus.APPROVED | BudgetStatus.REJECTED,
    by: string,
    role: TokenRole,
    note?: string,
  ): void {
    if (this.props.status !== BudgetStatus.AWAITING_APPROVAL) {
      throw new InvalidStatusTransitionException(this.props.status, status);
    }
    const now = new Date();
    this.props.status = status;
    this.props.decidedBy = by;
    this.props.decidedByRole = role;
    this.props.decidedAt = now;
    this.props.decisionNote = note;
    this.props.updatedAt = now;
  }

  get id(): string {
    return this._id;
  }
  get orderId(): string {
    return this.props.orderId;
  }
  get sagaId(): string {
    return this.props.sagaId;
  }
  get orderNumber(): string {
    return this.props.orderNumber;
  }
  get customer(): BudgetCustomer {
    return { ...this.props.customer };
  }
  get vehiclePlate(): string {
    return this.props.vehiclePlate;
  }
  get items(): BudgetItem[] {
    return [...this.props.items];
  }
  get totalAmount(): Money {
    return this.props.totalAmount;
  }
  get status(): BudgetStatus {
    return this.props.status;
  }
  get decidedBy(): string | undefined {
    return this.props.decidedBy;
  }
  get decidedByRole(): TokenRole | undefined {
    return this.props.decidedByRole;
  }
  get decidedAt(): Date | undefined {
    return this.props.decidedAt;
  }
  get decisionNote(): string | undefined {
    return this.props.decisionNote;
  }
  get cancelReason(): string | undefined {
    return this.props.cancelReason;
  }
  get canceledAt(): Date | undefined {
    return this.props.canceledAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
