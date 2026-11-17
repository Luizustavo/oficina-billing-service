import {
  PaymentGatewayUnavailableException,
  PaymentGatewayRejectedException,
} from '@shared/exceptions/domain.exceptions';
import {
  MercadoPagoConfig,
  MPAuthenticationError,
  MPResourceLockedError,
  MPDependencyError,
  MercadoPagoError,
  MPRateLimitError,
  MPServerError,
  PaymentRefund,
  Preference,
  Payment,
} from 'mercadopago';
import {
  CheckoutRequest,
  GatewayPayment,
  IPaymentGateway,
  GatewayRefund,
  Checkout,
} from '@domain/services/payment-gateway.interface';
import { mercadoPagoConfig } from '@infrastructure/config/mercado-pago.config';
import { Money } from '@domain/value-objects/money.value-object';
import { Injectable } from '@nestjs/common';

const TRANSIENT = [
  MPServerError,
  MPRateLimitError,
  MPResourceLockedError,
  MPDependencyError,
  MPAuthenticationError,
];

const toNumberAmount = (value: number | undefined): Money =>
  Money.fromCents(Math.round((value ?? 0) * 100));

@Injectable()
export class MercadoPagoGateway implements IPaymentGateway {
  private readonly config = mercadoPagoConfig().mercadoPago;
  private readonly client = new MercadoPagoConfig({
    accessToken: this.config.accessToken,
    options: { timeout: this.config.timeoutMs },
  });

  createCheckout(request: CheckoutRequest): Promise<Checkout> {
    return this.call(async () => {
      const preference = await new Preference(this.client).create({
        body: {
          items: [
            {
              id: request.budgetId,
              title: request.description,
              quantity: 1,
              unit_price: request.amount.toNumber(),
              currency_id: 'BRL',
            },
          ],
          payer: { email: request.payerEmail },
          external_reference: request.orderId,
          metadata: {
            budget_id: request.budgetId,
            payment_id: request.paymentId,
          },
          notification_url: this.notificationUrl(),
          statement_descriptor: 'OFICINA',
        },
        requestOptions: { idempotencyKey: request.budgetId },
      });
      return {
        preferenceId: String(preference.id),
        checkoutUrl: String(preference.init_point),
        sandboxCheckoutUrl: preference.sandbox_init_point,
      };
    });
  }

  getPayment(mpPaymentId: string): Promise<GatewayPayment> {
    return this.call(async () => {
      const payment = await new Payment(this.client).get({ id: mpPaymentId });
      const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
      return {
        mpPaymentId: String(payment.id),
        status: String(payment.status),
        statusDetail: payment.status_detail,
        budgetId:
          typeof metadata.budget_id === 'string'
            ? metadata.budget_id
            : undefined,
        orderId: payment.external_reference,
        amount: toNumberAmount(payment.transaction_amount),
        approvedAt: payment.date_approved
          ? new Date(payment.date_approved)
          : undefined,
      };
    });
  }

  refund(mpPaymentId: string, idempotencyKey: string): Promise<GatewayRefund> {
    return this.call(async () => {
      const refund = await new PaymentRefund(this.client).create({
        payment_id: mpPaymentId,
        requestOptions: { idempotencyKey },
      });
      return {
        refundId: String(refund.id),
        amount: toNumberAmount(refund.amount),
        refundedAt: refund.date_created
          ? new Date(refund.date_created)
          : new Date(),
      };
    });
  }

  async expireCheckout(preferenceId: string): Promise<void> {
    await this.call(async () => {
      const preferences = new Preference(this.client);
      const current = await preferences.get({ preferenceId });
      await preferences.update({
        id: preferenceId,
        updatePreferenceRequest: {
          items: current.items ?? [],
          expires: true,
          expiration_date_to: new Date().toISOString(),
        },
      });
    });
  }

  private notificationUrl(): string | undefined {
    return this.config.publicBaseUrl
      ? `${this.config.publicBaseUrl}/api/billing/webhooks/mercadopago`
      : undefined;
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rejected =
        error instanceof MercadoPagoError &&
        !TRANSIENT.some((type) => error instanceof type);
      throw rejected
        ? new PaymentGatewayRejectedException(message)
        : new PaymentGatewayUnavailableException(message);
    }
  }
}
