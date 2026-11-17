import { PaymentResponseDto } from '@application/dtos/response/payment.dto';
import { PaymentEntity } from '@domain/entities/payment/payment.entity';

export class PaymentMapper {
  private constructor() {
    throw new Error(
      'PaymentMapper is a static class and cannot be instantiated.',
    );
  }

  public static toResponse(payment: PaymentEntity): PaymentResponseDto {
    return {
      id: payment.id,
      budgetId: payment.budgetId,
      orderId: payment.orderId,
      amount: payment.amount.toDecimalString(),
      status: payment.status,
      checkoutUrl: payment.checkoutUrl,
      sandboxCheckoutUrl: payment.sandboxCheckoutUrl,
      failureReason: payment.failureReason,
      failureDetail: payment.failureDetail,
      paidAt: payment.paidAt,
      refundedAt: payment.refundedAt,
      createdAt: payment.createdAt,
    };
  }
}
