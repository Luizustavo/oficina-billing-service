import { ApprovedBudgetResponseDto } from '@application/dtos/response/budget.dto';
import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { IPaymentGateway } from '@domain/services/payment-gateway.interface';
import { assertCanAccess, Requester } from '@application/budget/requester';
import { PaymentEntity } from '@domain/entities/payment/payment.entity';
import { BudgetEvents } from '@application/budget/budget-events';
import { BudgetMapper } from '@application/mappers/budget.mapper';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class ApproveBudgetUseCase {
  constructor(
    private readonly budgets: IBudgetRepository,
    private readonly payments: IPaymentRepository,
    private readonly outbox: IOutboxRepository,
    private readonly gateway: IPaymentGateway,
    private readonly transactions: ITransactionManager,
    private readonly logger: Logger,
  ) {}

  async execute(
    budgetId: string,
    requester: Requester,
  ): Promise<ApprovedBudgetResponseDto> {
    this.logger.log(`Approving budget ${budgetId} (${requester.role})`);

    const budget = assertCanAccess(
      await this.budgets.findById(budgetId),
      requester,
      budgetId,
    );
    budget.ensureAwaitingApproval();

    const paymentId = randomUUID();
    // Fora da transação: chamada externa. A chave de idempotência (budgetId) faz uma nova tentativa reaproveitar o checkout.
    const checkout = await this.gateway.createCheckout({
      paymentId,
      budgetId: budget.id,
      orderId: budget.orderId,
      orderNumber: budget.orderNumber,
      payerEmail: budget.customer.email,
      amount: budget.totalAmount,
      description: `Ordem de serviço ${budget.orderNumber}`,
    });

    const { approved, payment } = await this.transactions.run(async () => {
      const fresh = assertCanAccess(
        await this.budgets.findById(budgetId),
        requester,
        budgetId,
      );
      fresh.approve(requester.id, requester.role);
      const saved = await this.budgets.update(fresh);
      const created = await this.payments.create(
        PaymentEntity.create(
          {
            budgetId: saved.id,
            orderId: saved.orderId,
            sagaId: saved.sagaId,
            customerId: saved.customer.id,
            amount: saved.totalAmount,
            mpPreferenceId: checkout.preferenceId,
            checkoutUrl: checkout.checkoutUrl,
            sandboxCheckoutUrl: checkout.sandboxCheckoutUrl,
          },
          paymentId,
        ),
      );
      await this.outbox.add([BudgetEvents.approved(saved)]);
      return { approved: saved, payment: created };
    });

    this.logger.log(
      `Budget ${budgetId} approved, checkout ${payment.mpPreferenceId} created`,
    );
    const response: ApprovedBudgetResponseDto = {
      ...BudgetMapper.toResponse(approved),
      checkoutUrl: payment.checkoutUrl,
      sandboxCheckoutUrl: payment.sandboxCheckoutUrl,
    };
    return response;
  }
}
