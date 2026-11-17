import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

export type WebhookOutcome =
  | 'processed'
  | 'duplicate'
  | 'ignored'
  | 'not_payment'
  | 'invalid_signature';

@Injectable()
export class BillingMetrics {
  private readonly meter = metrics.getMeter('oficina-billing-service');

  private readonly payments = this.meter.createCounter('billing.payments', {
    description: 'Pagamentos que entraram em cada status',
    unit: '{payment}',
  });

  private readonly webhooks = this.meter.createCounter(
    'billing.webhook.received',
    {
      description: 'Avisos do Mercado Pago recebidos, por desfecho',
      unit: '{notification}',
    },
  );

  recordPaymentStatus(status: string): void {
    this.payments.add(1, { status });
  }

  recordWebhook(outcome: WebhookOutcome): void {
    this.webhooks.add(1, { outcome });
  }
}
