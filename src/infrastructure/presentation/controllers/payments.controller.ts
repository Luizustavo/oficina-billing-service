import {
  CurrentUser,
  JwtPayload,
} from '@infrastructure/presentation/decorators/current-user.decorator';
import { GetOrderPaymentUseCase } from '@application/use-cases/payment/get-order-payment.use-case';
import { Roles } from '@infrastructure/presentation/decorators/roles.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param } from '@nestjs/common';
import { TokenRole } from '@domain/enums/token-role.enum';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('api/billing')
@Roles(TokenRole.CUSTOMER, TokenRole.ADMIN, TokenRole.ATTENDANT)
export class PaymentsController {
  constructor(private readonly getOrderPayment: GetOrderPaymentUseCase) {}

  @Get('orders/:orderId/payment')
  @ApiOperation({
    summary:
      'Payment of the service order: status and Mercado Pago checkout link',
  })
  findByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getOrderPayment.execute(orderId, {
      id: user.sub,
      role: user.role,
    });
  }
}
