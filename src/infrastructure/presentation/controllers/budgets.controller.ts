import {
  CurrentUser,
  JwtPayload,
} from '@infrastructure/presentation/decorators/current-user.decorator';
import { GetOrderBudgetUseCase } from '@application/use-cases/budget/get-order-budget.use-case';
import { ApproveBudgetUseCase } from '@application/use-cases/budget/approve-budget.use-case';
import { RejectBudgetUseCase } from '@application/use-cases/budget/reject-budget.use-case';
import { RejectBudgetRequestDto } from '@application/dtos/request/reject-budget.dto';
import { Roles } from '@infrastructure/presentation/decorators/roles.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TokenRole } from '@domain/enums/token-role.enum';
import { Requester } from '@application/budget/requester';

const requesterOf = (user: JwtPayload): Requester => ({
  id: user.sub,
  role: user.role,
});

@ApiTags('budgets')
@ApiBearerAuth()
@Controller('api/billing')
@Roles(TokenRole.CUSTOMER, TokenRole.ADMIN, TokenRole.ATTENDANT)
export class BudgetsController {
  constructor(
    private readonly getOrderBudget: GetOrderBudgetUseCase,
    private readonly approveBudget: ApproveBudgetUseCase,
    private readonly rejectBudget: RejectBudgetUseCase,
  ) {}

  @Get('orders/:orderId/budget')
  @ApiOperation({
    summary: 'Current budget of a service order (customers only see their own)',
  })
  findByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getOrderBudget.execute(orderId, requesterOf(user));
  }

  @Post('budgets/:id/approve')
  @ApiOperation({
    summary: 'Approve the budget: the saga reserves parts and asks for payment',
  })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.approveBudget.execute(id, requesterOf(user));
  }

  @Post('budgets/:id/reject')
  @ApiOperation({
    summary: 'Reject the budget: the saga cancels the service order',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBudgetRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rejectBudget.execute(id, requesterOf(user), dto.reason);
  }
}
