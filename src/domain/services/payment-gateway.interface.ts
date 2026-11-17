import { Money } from '@domain/value-objects/money.value-object';

export interface CheckoutRequest {
  paymentId: string;
  budgetId: string;
  orderId: string;
  orderNumber: string;
  payerEmail: string;
  amount: Money;
  description: string;
}

export interface Checkout {
  preferenceId: string;
  checkoutUrl: string;
  sandboxCheckoutUrl?: string;
}

export interface GatewayPayment {
  mpPaymentId: string;
  status: string;
  statusDetail?: string;
  budgetId?: string;
  orderId?: string;
  amount: Money;
  approvedAt?: Date;
}

export interface GatewayRefund {
  refundId: string;
  amount: Money;
  refundedAt: Date;
}

/**
 * Erros: PaymentGatewayUnavailableException (vale tentar de novo) ou
 * PaymentGatewayRejectedException (o Mercado Pago recusou de vez).
 */
export abstract class IPaymentGateway {
  abstract createCheckout(request: CheckoutRequest): Promise<Checkout>;
  abstract getPayment(mpPaymentId: string): Promise<GatewayPayment>;
  abstract refund(
    mpPaymentId: string,
    idempotencyKey: string,
  ): Promise<GatewayRefund>;
  abstract expireCheckout(preferenceId: string): Promise<void>;
}
