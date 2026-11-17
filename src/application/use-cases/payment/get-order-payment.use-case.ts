import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { NotFoundException } from '@shared/exceptions/domain.exceptions';
import { PaymentResponseDto } from '@application/dtos/response/payment.dto';
import { PaymentMapper } from '@application/mappers/payment.mapper';
import { TokenRole } from '@domain/enums/token-role.enum';
import { Requester } from '@application/budget/requester';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GetOrderPaymentUseCase {
  constructor(
    private readonly payments: IPaymentRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    orderId: string,
    requester: Requester,
  ): Promise<PaymentResponseDto> {
    this.logger.log(`Fetching payment of order ${orderId}`);

    const payment = await this.payments.findCurrentByOrderId(orderId);
    if (
      !payment ||
      (requester.role === TokenRole.CUSTOMER &&
        !payment.isOwnedBy(requester.id))
    ) {
      this.logger.warn(`No payment visible for order ${orderId}`);
      throw new NotFoundException('Payment of order', orderId);
    }

    this.logger.log(`Payment ${payment.id} of order ${orderId} found`);
    const response: PaymentResponseDto = PaymentMapper.toResponse(payment);
    return response;
  }
}
