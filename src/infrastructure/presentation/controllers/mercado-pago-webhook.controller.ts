import {
  UnauthorizedException,
  Controller,
  HttpCode,
  Headers,
  Query,
  Post,
  Body,
} from '@nestjs/common';
import { HandlePaymentNotificationUseCase } from '@application/use-cases/payment/handle-payment-notification.use-case';
import { Public } from '@infrastructure/presentation/decorators/public.decorator';
import { mercadoPagoConfig } from '@infrastructure/config/mercado-pago.config';
import { BillingMetrics } from '@infrastructure/observability/billing.metrics';
import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from 'mercadopago';
import { ApiExcludeController } from '@nestjs/swagger';

type Notification = Record<string, unknown> & {
  type?: string;
  data?: { id?: string | number };
};

@Public()
@ApiExcludeController()
@Controller('api/billing/webhooks')
export class MercadoPagoWebhookController {
  private readonly secret = mercadoPagoConfig().mercadoPago.webhookSecret;

  constructor(
    private readonly handleNotification: HandlePaymentNotificationUseCase,
    private readonly metrics: BillingMetrics,
  ) {}

  @Post('mercadopago')
  @HttpCode(200)
  async receive(
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, string | undefined>,
    @Body() body: Notification,
  ) {
    const dataId = query['data.id'] ?? body?.data?.id?.toString();
    const type = query.type ?? body?.type;
    // IPN antigo e merchant_order chegam sem assinatura; o aviso de pagamento assinado vem junto.
    if (type !== 'payment' || !dataId) {
      this.metrics.recordWebhook('not_payment');
      return { received: true, outcome: 'ignored' };
    }

    this.assertSignature(signature, requestId, dataId);
    const outcome = await this.handleNotification.execute(dataId);
    this.metrics.recordWebhook(outcome);
    return { received: true, outcome };
  }

  private assertSignature(
    signature: string | undefined,
    requestId: string | undefined,
    dataId: string | undefined,
  ): void {
    try {
      WebhookSignatureValidator.validate({
        xSignature: signature,
        xRequestId: requestId,
        dataId,
        secret: this.secret,
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        this.metrics.recordWebhook('invalid_signature');
        throw new UnauthorizedException(`Invalid signature: ${error.reason}`);
      }
      throw error;
    }
  }
}
