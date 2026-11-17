export interface PaymentResponseDto {
  id: string;
  budgetId: string;
  orderId: string;
  amount: string;
  status: string;
  checkoutUrl: string;
  sandboxCheckoutUrl?: string;
  failureReason?: string;
  failureDetail?: string;
  paidAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
}
