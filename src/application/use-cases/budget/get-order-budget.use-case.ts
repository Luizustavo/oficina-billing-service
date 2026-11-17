import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { assertCanAccess, Requester } from '@application/budget/requester';
import { BudgetResponseDto } from '@application/dtos/response/budget.dto';
import { BudgetMapper } from '@application/mappers/budget.mapper';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GetOrderBudgetUseCase {
  constructor(
    private readonly budgets: IBudgetRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    orderId: string,
    requester: Requester,
  ): Promise<BudgetResponseDto> {
    this.logger.log(`Fetching budget of order ${orderId}`);

    const budget = assertCanAccess(
      await this.budgets.findCurrentByOrderId(orderId),
      requester,
      orderId,
    );

    this.logger.log(`Budget ${budget.id} of order ${orderId} found`);
    const response: BudgetResponseDto = BudgetMapper.toResponse(budget);
    return response;
  }
}
