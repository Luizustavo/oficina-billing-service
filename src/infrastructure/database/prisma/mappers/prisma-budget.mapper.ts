import {
  BudgetItem as PrismaBudgetItem,
  Budget as PrismaBudget,
  Prisma,
} from '@generated/prisma/client';
import { BudgetItemKind, BudgetStatus } from '@domain/enums/budget.enum';
import { BudgetEntity } from '@domain/entities/budget/budget.entity';
import { Money } from '@domain/value-objects/money.value-object';
import { TokenRole } from '@domain/enums/token-role.enum';

export type PrismaBudgetWithItems = PrismaBudget & {
  items: PrismaBudgetItem[];
};

const toMoney = (value: Prisma.Decimal): Money =>
  Money.fromDecimalString(value.toFixed(2));

export class PrismaBudgetMapper {
  private constructor() {
    throw new Error(
      'PrismaBudgetMapper is a static class and cannot be instantiated.',
    );
  }

  public static toPrisma(
    budget: BudgetEntity,
  ): Omit<Prisma.BudgetUncheckedCreateInput, 'items'> {
    return {
      id: budget.id,
      orderId: budget.orderId,
      sagaId: budget.sagaId,
      orderNumber: budget.orderNumber,
      customerId: budget.customer.id,
      customerName: budget.customer.name,
      customerEmail: budget.customer.email,
      vehiclePlate: budget.vehiclePlate,
      totalAmount: budget.totalAmount.toDecimalString(),
      status: budget.status,
      decidedBy: budget.decidedBy ?? null,
      decidedByRole: budget.decidedByRole ?? null,
      decidedAt: budget.decidedAt ?? null,
      decisionNote: budget.decisionNote ?? null,
      cancelReason: budget.cancelReason ?? null,
      canceledAt: budget.canceledAt ?? null,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    };
  }

  public static toPrismaItems(
    budget: BudgetEntity,
  ): Prisma.BudgetItemCreateWithoutBudgetInput[] {
    return budget.items.map((item, position) => ({
      kind: item.kind,
      refId: item.refId,
      name: item.name,
      unitPrice: item.unitPrice.toDecimalString(),
      quantity: item.quantity,
      position,
    }));
  }

  public static toEntity(prisma: PrismaBudgetWithItems): BudgetEntity {
    return BudgetEntity.reconstitute(
      {
        orderId: prisma.orderId,
        sagaId: prisma.sagaId,
        orderNumber: prisma.orderNumber,
        customer: {
          id: prisma.customerId,
          name: prisma.customerName,
          email: prisma.customerEmail,
        },
        vehiclePlate: prisma.vehiclePlate,
        items: [...prisma.items]
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            kind: item.kind as BudgetItemKind,
            refId: item.refId,
            name: item.name,
            unitPrice: toMoney(item.unitPrice),
            quantity: item.quantity,
          })),
        totalAmount: toMoney(prisma.totalAmount),
        status: prisma.status as BudgetStatus,
        decidedBy: prisma.decidedBy ?? undefined,
        decidedByRole: (prisma.decidedByRole as TokenRole | null) ?? undefined,
        decidedAt: prisma.decidedAt ?? undefined,
        decisionNote: prisma.decisionNote ?? undefined,
        cancelReason: prisma.cancelReason ?? undefined,
        canceledAt: prisma.canceledAt ?? undefined,
        createdAt: prisma.createdAt,
        updatedAt: prisma.updatedAt,
      },
      prisma.id,
    );
  }
}
