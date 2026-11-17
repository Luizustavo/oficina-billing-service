import { BudgetResponseDto } from '@application/dtos/response/budget.dto';
import { BudgetEntity } from '@domain/entities/budget/budget.entity';

export class BudgetMapper {
  private constructor() {
    throw new Error(
      'BudgetMapper is a static class and cannot be instantiated.',
    );
  }

  public static toResponse(budget: BudgetEntity): BudgetResponseDto {
    return {
      id: budget.id,
      orderId: budget.orderId,
      orderNumber: budget.orderNumber,
      customerName: budget.customer.name,
      vehiclePlate: budget.vehiclePlate,
      items: budget.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        unitPrice: item.unitPrice.toDecimalString(),
        quantity: item.quantity,
        total: item.unitPrice.times(item.quantity).toDecimalString(),
      })),
      totalAmount: budget.totalAmount.toDecimalString(),
      status: budget.status,
      decidedAt: budget.decidedAt,
      decisionNote: budget.decisionNote,
      cancelReason: budget.cancelReason,
      createdAt: budget.createdAt,
    };
  }
}
