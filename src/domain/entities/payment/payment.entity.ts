import {
  PaymentFailureReason,
  PaymentStatus,
} from '@domain/enums/payment.enum';
import { Money } from '@domain/value-objects/money.value-object';

export interface PaymentProps {
  budgetId: string;
  orderId: string;
  sagaId: string;
  customerId: string;
  amount: Money;
  status: PaymentStatus;
  mpPreferenceId: string;
  checkoutUrl: string;
  sandboxCheckoutUrl?: string;
  mpPaymentId?: string;
  failureReason?: PaymentFailureReason;
  failureDetail?: string;
  paidAt?: Date;
  mpRefundId?: string;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CreatePaymentProps = Pick<
  PaymentProps,
  | 'budgetId'
  | 'orderId'
  | 'sagaId'
  | 'customerId'
  | 'amount'
  | 'mpPreferenceId'
  | 'checkoutUrl'
  | 'sandboxCheckoutUrl'
>;

/** As transições devolvem `false` quando não mudam nada: notificações do Mercado Pago se repetem. */
export class PaymentEntity {
  private readonly props: PaymentProps;
  private readonly _id: string;

  private constructor(props: PaymentProps, id?: string) {
    this.props = props;
    this._id = id ?? '';
  }

  static create(props: CreatePaymentProps, id?: string): PaymentEntity {
    const now = new Date();
    return new PaymentEntity(
      {
        ...props,
        status: PaymentStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
  }

  static reconstitute(props: PaymentProps, id?: string): PaymentEntity {
    return new PaymentEntity(props, id);
  }

  /** Aceita pagamento de checkout já expirado: o OS estorna (LATE_PAYMENT). */
  confirm(mpPaymentId: string, paidAt: Date): boolean {
    if (
      this.props.status !== PaymentStatus.PENDING &&
      this.props.status !== PaymentStatus.EXPIRED
    ) {
      return false;
    }
    this.props.status = PaymentStatus.APPROVED;
    this.props.mpPaymentId = mpPaymentId;
    this.props.paidAt = paidAt;
    return this.touch();
  }

  fail(
    mpPaymentId: string,
    reason: PaymentFailureReason,
    detail?: string,
  ): boolean {
    if (this.props.status !== PaymentStatus.PENDING) {
      return false;
    }
    this.props.status =
      reason === 'CANCELLED' ? PaymentStatus.CANCELLED : PaymentStatus.REJECTED;
    this.props.mpPaymentId = mpPaymentId;
    this.props.failureReason = reason;
    this.props.failureDetail = detail;
    return this.touch();
  }

  expire(): boolean {
    if (this.props.status !== PaymentStatus.PENDING) {
      return false;
    }
    this.props.status = PaymentStatus.EXPIRED;
    return this.touch();
  }

  markRefunded(mpRefundId: string, refundedAt: Date): boolean {
    if (this.props.status !== PaymentStatus.APPROVED) {
      return false;
    }
    this.props.status = PaymentStatus.REFUNDED;
    this.props.mpRefundId = mpRefundId;
    this.props.refundedAt = refundedAt;
    return this.touch();
  }

  markRefundFailed(detail: string): boolean {
    if (this.props.status !== PaymentStatus.APPROVED) {
      return false;
    }
    this.props.status = PaymentStatus.REFUND_FAILED;
    this.props.failureDetail = detail;
    return this.touch();
  }

  isOwnedBy(customerId: string): boolean {
    return this.props.customerId === customerId;
  }

  private touch(): true {
    this.props.updatedAt = new Date();
    return true;
  }

  get id(): string {
    return this._id;
  }
  get budgetId(): string {
    return this.props.budgetId;
  }
  get orderId(): string {
    return this.props.orderId;
  }
  get sagaId(): string {
    return this.props.sagaId;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get status(): PaymentStatus {
    return this.props.status;
  }
  get mpPreferenceId(): string {
    return this.props.mpPreferenceId;
  }
  get checkoutUrl(): string {
    return this.props.checkoutUrl;
  }
  get sandboxCheckoutUrl(): string | undefined {
    return this.props.sandboxCheckoutUrl;
  }
  get mpPaymentId(): string | undefined {
    return this.props.mpPaymentId;
  }
  get failureReason(): PaymentFailureReason | undefined {
    return this.props.failureReason;
  }
  get failureDetail(): string | undefined {
    return this.props.failureDetail;
  }
  get paidAt(): Date | undefined {
    return this.props.paidAt;
  }
  get mpRefundId(): string | undefined {
    return this.props.mpRefundId;
  }
  get refundedAt(): Date | undefined {
    return this.props.refundedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
