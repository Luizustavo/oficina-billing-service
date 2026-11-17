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
      return { received: true, outcome: 'ignored' };
    }

    this.assertSignature(signature, requestId, dataId);
    return {
      received: true,
      outcome: await this.handleNotification.execute(dataId),
    };
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
        throw new UnauthorizedException(`Invalid signature: ${error.reason}`);
      }
      throw error;
    }
  }
}
