import { Payment as PrismaPayment, Prisma } from '@generated/prisma/client';
import {
  PaymentFailureReason,
  PaymentStatus,
} from '@domain/enums/payment.enum';
import { PaymentEntity } from '@domain/entities/payment/payment.entity';
import { Money } from '@domain/value-objects/money.value-object';

export class PrismaPaymentMapper {
  private constructor() {
    throw new Error(
      'PrismaPaymentMapper is a static class and cannot be instantiated.',
    );
  }

  public static toPrisma(
    payment: PaymentEntity,
  ): Prisma.PaymentUncheckedCreateInput {
    return {
      id: payment.id,
      budgetId: payment.budgetId,
      orderId: payment.orderId,
      sagaId: payment.sagaId,
      customerId: payment.customerId,
      amount: payment.amount.toDecimalString(),
      status: payment.status,
      mpPreferenceId: payment.mpPreferenceId,
      checkoutUrl: payment.checkoutUrl,
      sandboxCheckoutUrl: payment.sandboxCheckoutUrl ?? null,
      mpPaymentId: payment.mpPaymentId ?? null,
      failureReason: payment.failureReason ?? null,
      failureDetail: payment.failureDetail ?? null,
      paidAt: payment.paidAt ?? null,
      mpRefundId: payment.mpRefundId ?? null,
      refundedAt: payment.refundedAt ?? null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  public static toEntity(prisma: PrismaPayment): PaymentEntity {
    return PaymentEntity.reconstitute(
      {
        budgetId: prisma.budgetId,
        orderId: prisma.orderId,
        sagaId: prisma.sagaId,
        customerId: prisma.customerId,
        amount: Money.fromDecimalString(prisma.amount.toFixed(2)),
        status: prisma.status as PaymentStatus,
        mpPreferenceId: prisma.mpPreferenceId,
        checkoutUrl: prisma.checkoutUrl,
        sandboxCheckoutUrl: prisma.sandboxCheckoutUrl ?? undefined,
        mpPaymentId: prisma.mpPaymentId ?? undefined,
        failureReason:
          (prisma.failureReason as PaymentFailureReason | null) ?? undefined,
        failureDetail: prisma.failureDetail ?? undefined,
        paidAt: prisma.paidAt ?? undefined,
        mpRefundId: prisma.mpRefundId ?? undefined,
        refundedAt: prisma.refundedAt ?? undefined,
        createdAt: prisma.createdAt,
        updatedAt: prisma.updatedAt,
      },
      prisma.id,
    );
  }
}
