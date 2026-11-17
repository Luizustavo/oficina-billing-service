export interface BudgetItemResponseDto {
  kind: string;
  name: string;
  unitPrice: string;
  quantity: number;
  total: string;
}

export interface BudgetResponseDto {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  vehiclePlate: string;
  items: BudgetItemResponseDto[];
  totalAmount: string;
  status: string;
  decidedAt?: Date;
  decisionNote?: string;
  cancelReason?: string;
  createdAt: Date;
}
