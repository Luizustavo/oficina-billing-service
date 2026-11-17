import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { PrismaBudgetMapper } from '@infrastructure/database/prisma/mappers/prisma-budget.mapper';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { BudgetEntity } from '@domain/entities/budget/budget.entity';
import { Injectable } from '@nestjs/common';

const WITH_ITEMS = { items: true } as const;

@Injectable()
export class BudgetRepository implements IBudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(budget: BudgetEntity): Promise<BudgetEntity> {
    const created = await this.prisma.budget.create({
      data: {
        ...PrismaBudgetMapper.toPrisma(budget),
        items: { create: PrismaBudgetMapper.toPrismaItems(budget) },
      },
      include: WITH_ITEMS,
    });
    return PrismaBudgetMapper.toEntity(created);
  }

  async update(budget: BudgetEntity): Promise<BudgetEntity> {
    const updated = await this.prisma.budget.update({
      where: { id: budget.id },
      data: PrismaBudgetMapper.toPrisma(budget),
      include: WITH_ITEMS,
    });
    return PrismaBudgetMapper.toEntity(updated);
  }

  async findById(id: string): Promise<BudgetEntity | null> {
    const found = await this.prisma.budget.findUnique({
      where: { id },
      include: WITH_ITEMS,
    });
    return found ? PrismaBudgetMapper.toEntity(found) : null;
  }

  async findBySagaId(sagaId: string): Promise<BudgetEntity | null> {
    const found = await this.prisma.budget.findUnique({
      where: { sagaId },
      include: WITH_ITEMS,
    });
    return found ? PrismaBudgetMapper.toEntity(found) : null;
  }

  async findCurrentByOrderId(orderId: string): Promise<BudgetEntity | null> {
    const found = await this.prisma.budget.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: WITH_ITEMS,
    });
    return found ? PrismaBudgetMapper.toEntity(found) : null;
  }
}
