import { PaymentEntity } from '@domain/entities/payment/payment.entity';

export abstract class IPaymentRepository {
  abstract create(payment: PaymentEntity): Promise<PaymentEntity>;
  abstract update(payment: PaymentEntity): Promise<PaymentEntity>;
  abstract findById(id: string): Promise<PaymentEntity | null>;
  abstract findByBudgetId(budgetId: string): Promise<PaymentEntity | null>;
  abstract findBySagaId(sagaId: string): Promise<PaymentEntity | null>;
  abstract findCurrentByOrderId(orderId: string): Promise<PaymentEntity | null>;
}
