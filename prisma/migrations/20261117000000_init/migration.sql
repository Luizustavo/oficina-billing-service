-- Billing Service: orçamentos, outbox e mensagens processadas (ADR-010, ADR-011).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BudgetItemKind" AS ENUM ('SERVICE', 'PART');

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" "BudgetStatus" NOT NULL,
    "decidedBy" TEXT,
    "decidedByRole" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "cancelReason" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "kind" "BudgetItemKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "traceparent" TEXT,
    "tracestate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_messages" (
    "messageId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_sagaId_key" ON "budgets"("sagaId");

-- CreateIndex
CREATE INDEX "budgets_orderId_createdAt_idx" ON "budgets"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "budgets_customerId_idx" ON "budgets"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_items_budgetId_position_key" ON "budget_items"("budgetId", "position");

-- CreateIndex
CREATE INDEX "outbox_messages_publishedAt_createdAt_idx" ON "outbox_messages"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

