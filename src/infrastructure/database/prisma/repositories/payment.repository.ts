import { IPaymentRepository } from '@domain/repositories/payment.repository.interface';
import { PrismaPaymentMapper } from '@infrastructure/database/prisma/mappers/prisma-payment.mapper';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { PaymentEntity } from '@domain/entities/payment/payment.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(payment: PaymentEntity): Promise<PaymentEntity> {
    const created = await this.prisma.payment.create({
      data: PrismaPaymentMapper.toPrisma(payment),
    });
    return PrismaPaymentMapper.toEntity(created);
  }

  async update(payment: PaymentEntity): Promise<PaymentEntity> {
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: PrismaPaymentMapper.toPrisma(payment),
    });
    return PrismaPaymentMapper.toEntity(updated);
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    return this.toEntity(
      await this.prisma.payment.findUnique({ where: { id } }),
    );
  }

  async findByBudgetId(budgetId: string): Promise<PaymentEntity | null> {
    return this.toEntity(
      await this.prisma.payment.findUnique({ where: { budgetId } }),
    );
  }

  async findBySagaId(sagaId: string): Promise<PaymentEntity | null> {
    return this.toEntity(
      await this.prisma.payment.findUnique({ where: { sagaId } }),
    );
  }

  async findCurrentByOrderId(orderId: string): Promise<PaymentEntity | null> {
    return this.toEntity(
      await this.prisma.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  private toEntity(
    found: Parameters<typeof PrismaPaymentMapper.toEntity>[0] | null,
  ): PaymentEntity | null {
    return found ? PrismaPaymentMapper.toEntity(found) : null;
  }
}
