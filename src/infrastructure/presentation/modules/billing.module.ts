import { HandlePaymentNotificationUseCase } from '@application/use-cases/payment/handle-payment-notification.use-case';
import { MercadoPagoWebhookController } from '@infrastructure/presentation/controllers/mercado-pago-webhook.controller';
import { GetOrderPaymentUseCase } from '@application/use-cases/payment/get-order-payment.use-case';
import { GetOrderBudgetUseCase } from '@application/use-cases/budget/get-order-budget.use-case';
import { RefundPaymentUseCase } from '@application/use-cases/payment/refund-payment.use-case';
import { ApproveBudgetUseCase } from '@application/use-cases/budget/approve-budget.use-case';
import { RejectBudgetUseCase } from '@application/use-cases/budget/reject-budget.use-case';
import { CreateBudgetUseCase } from '@application/use-cases/budget/create-budget.use-case';
import { CancelBudgetUseCase } from '@application/use-cases/budget/cancel-budget.use-case';
import { PrismaTransactionManager } from '@infrastructure/database/prisma/prisma-transaction-manager';
import { PaymentRepository } from '@infrastructure/database/prisma/repositories/payment.repository';
import { PaymentsController } from '@infrastructure/presentation/controllers/payments.controller';
import { BudgetsController } from '@infrastructure/presentation/controllers/budgets.controller';
import { BudgetRepository } from '@infrastructure/database/prisma/repositories/budget.repository';
import { OutboxRepository } from '@infrastructure/database/prisma/repositories/outbox.repository';
import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { BillingCommandHandlers } from '@infrastructure/messaging/billing-command-handlers';
import { IIdempotencyStore } from '@domain/services/idempotency-store.interface';
import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { RedisIdempotencyStore } from '@infrastructure/redis/redis-idempotency.store';
import { RedisDistributedLock } from '@infrastructure/redis/redis-distributed.lock';
import { IDistributedLock } from '@domain/services/distributed-lock.interface';
import { MercadoPagoGateway } from '@infrastructure/payment/mercado-pago.gateway';
import { IPaymentGateway } from '@domain/services/payment-gateway.interface';
import { BillingMetrics } from '@infrastructure/observability/billing.metrics';
import { RedisClient } from '@infrastructure/redis/redis.client';
import { Logger, Module } from '@nestjs/common';

@Module({
  controllers: [
    BudgetsController,
    PaymentsController,
    MercadoPagoWebhookController,
  ],
  providers: [
    Logger,
    BillingMetrics,
    RedisClient,
    CreateBudgetUseCase,
    CancelBudgetUseCase,
    GetOrderBudgetUseCase,
    ApproveBudgetUseCase,
    RejectBudgetUseCase,
    HandlePaymentNotificationUseCase,
    RefundPaymentUseCase,
    GetOrderPaymentUseCase,
    BillingCommandHandlers,
    { provide: IBudgetRepository, useClass: BudgetRepository },
    { provide: IPaymentRepository, useClass: PaymentRepository },
    { provide: IOutboxRepository, useClass: OutboxRepository },
    { provide: ITransactionManager, useClass: PrismaTransactionManager },
    { provide: IPaymentGateway, useClass: MercadoPagoGateway },
    { provide: IIdempotencyStore, useClass: RedisIdempotencyStore },
    { provide: IDistributedLock, useClass: RedisDistributedLock },
  ],
})
export class BillingModule {}
