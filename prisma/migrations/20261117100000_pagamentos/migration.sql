-- Pagamentos do Mercado Pago Checkout Pro: um por orçamento.

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REFUND_FAILED');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "mpPreferenceId" TEXT NOT NULL,
    "checkoutUrl" TEXT NOT NULL,
    "sandboxCheckoutUrl" TEXT,
    "mpPaymentId" TEXT,
    "failureReason" TEXT,
    "failureDetail" TEXT,
    "paidAt" TIMESTAMP(3),
    "mpRefundId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_budgetId_key" ON "payments"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_sagaId_key" ON "payments"("sagaId");

-- CreateIndex
CREATE INDEX "payments_orderId_createdAt_idx" ON "payments"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

