import { InvalidBudgetException } from '@shared/exceptions/domain.exceptions';
import { parseBudgetCreatePayload } from './budget-create-payload';
import { BudgetItemKind } from '@domain/enums/budget.enum';

const contractExample = () => ({
  orderNumber: 'OS-2026-000123',
  customer: { id: 'c-1', name: 'Maria Souza', email: 'maria@exemplo.com' },
  vehiclePlate: 'ABC1D23',
  services: [
    {
      serviceId: 'sv-1',
      name: 'Troca de óleo',
      unitPrice: '150.00',
      quantity: 1,
    },
  ],
  parts: [
    { partId: 'p-1', name: 'Filtro de óleo', unitPrice: '45.90', quantity: 1 },
  ],
  totalAmount: '195.90',
});

const reasonOf = (payload: Record<string, unknown>): string | undefined => {
  try {
    parseBudgetCreatePayload(payload);
  } catch (error) {
    return error instanceof InvalidBudgetException ? error.reason : 'other';
  }
  return undefined;
};

describe('parseBudgetCreatePayload', () => {
  it('lê o exemplo do contrato', () => {
    const command = parseBudgetCreatePayload(contractExample());
    expect(command.orderNumber).toBe('OS-2026-000123');
    expect(command.customer).toEqual({
      id: 'c-1',
      name: 'Maria Souza',
      email: 'maria@exemplo.com',
    });
    expect(command.declaredTotal.toDecimalString()).toBe('195.90');
    expect(command.items.map((i) => [i.kind, i.refId, i.quantity])).toEqual([
      [BudgetItemKind.SERVICE, 'sv-1', 1],
      [BudgetItemKind.PART, 'p-1', 1],
    ]);
    expect(command.items[1].unitPrice.toDecimalString()).toBe('45.90');
  });

  it('aceita orçamento só com serviços', () => {
    const payload = { ...contractExample(), parts: undefined };
    expect(parseBudgetCreatePayload(payload).items).toHaveLength(1);
  });

  it.each([
    ['sem orderNumber', { orderNumber: undefined }],
    ['sem cliente', { customer: undefined }],
    ['cliente sem e-mail', { customer: { id: 'c-1', name: 'Maria' } }],
    ['valor como número', { totalAmount: 195.9 }],
    ['valor com 3 casas', { totalAmount: '195.900' }],
    ['services não é lista', { services: 'x' }],
    ['item que não é objeto', { parts: ['x'] }],
    [
      'item sem preço',
      { parts: [{ partId: 'p-1', name: 'Filtro', quantity: 1 }] },
    ],
  ])('recusa payload %s', (_label, change) => {
    expect(reasonOf({ ...contractExample(), ...change })).toBe(
      'INVALID_PAYLOAD',
    );
  });
});
