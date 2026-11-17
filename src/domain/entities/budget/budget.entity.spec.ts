import {
  InvalidStatusTransitionException,
  InvalidBudgetException,
} from '@shared/exceptions/domain.exceptions';
import { BudgetItemKind, BudgetStatus } from '@domain/enums/budget.enum';
import { BudgetEntity, CreateBudgetProps } from './budget.entity';
import { Money } from '@domain/value-objects/money.value-object';
import { TokenRole } from '@domain/enums/token-role.enum';

const props = (
  overrides: Partial<CreateBudgetProps> = {},
): CreateBudgetProps => ({
  orderId: 'o-1',
  sagaId: 's-1',
  orderNumber: 'OS2026000123',
  customer: { id: 'c-1', name: 'Maria Souza', email: 'maria@exemplo.com' },
  vehiclePlate: 'ABC1D23',
  items: [
    {
      kind: BudgetItemKind.SERVICE,
      refId: 'sv-1',
      name: 'Troca de óleo',
      unitPrice: Money.fromDecimalString('150.00'),
      quantity: 1,
    },
    {
      kind: BudgetItemKind.PART,
      refId: 'p-1',
      name: 'Filtro de óleo',
      unitPrice: Money.fromDecimalString('45.90'),
      quantity: 2,
    },
  ],
  declaredTotal: Money.fromDecimalString('241.80'),
  ...overrides,
});

const failure = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof InvalidBudgetException ? error.reason : undefined;
  }
  return undefined;
};

describe('BudgetEntity', () => {
  describe('create', () => {
    it('cria aguardando aprovação, com o total calculado pelos itens', () => {
      const budget = BudgetEntity.create(props(), 'b-1');
      expect(budget.id).toBe('b-1');
      expect(budget.status).toBe(BudgetStatus.AWAITING_APPROVAL);
      expect(budget.totalAmount.toDecimalString()).toBe('241.80');
      expect(budget.items).toHaveLength(2);
    });

    it('recusa orçamento sem itens', () => {
      expect(failure(() => BudgetEntity.create(props({ items: [] })))).toBe(
        'INVALID_ITEMS',
      );
    });

    it.each([0, -1, 1.5])('recusa quantidade %p', (quantity) => {
      const items = props().items.map((item) => ({ ...item, quantity }));
      expect(failure(() => BudgetEntity.create(props({ items })))).toBe(
        'INVALID_ITEMS',
      );
    });

    it('recusa quando o total informado não bate com a soma dos itens', () => {
      expect(
        failure(() =>
          BudgetEntity.create(
            props({ declaredTotal: Money.fromDecimalString('241.81') }),
          ),
        ),
      ).toBe('TOTAL_MISMATCH');
    });
  });

  describe('decisão do cliente', () => {
    it('aprova e registra quem e quando', () => {
      const budget = BudgetEntity.create(props());
      budget.approve('c-1', TokenRole.CUSTOMER);
      expect(budget.status).toBe(BudgetStatus.APPROVED);
      expect(budget.decidedBy).toBe('c-1');
      expect(budget.decidedByRole).toBe(TokenRole.CUSTOMER);
      expect(budget.decidedAt).toBeInstanceOf(Date);
    });

    it('recusa com observação', () => {
      const budget = BudgetEntity.create(props());
      budget.reject('c-1', TokenRole.CUSTOMER, 'Muito caro');
      expect(budget.status).toBe(BudgetStatus.REJECTED);
      expect(budget.decisionNote).toBe('Muito caro');
    });

    it('não decide duas vezes', () => {
      const budget = BudgetEntity.create(props());
      budget.approve('c-1', TokenRole.CUSTOMER);
      expect(() => budget.reject('c-1', TokenRole.CUSTOMER)).toThrow(
        InvalidStatusTransitionException,
      );
    });

    it('não decide um orçamento cancelado', () => {
      const budget = BudgetEntity.create(props());
      budget.cancel('APPROVAL_TIMEOUT');
      expect(() => budget.approve('c-1', TokenRole.CUSTOMER)).toThrow(
        InvalidStatusTransitionException,
      );
    });
  });

  describe('cancel', () => {
    it.each([
      ['aguardando aprovação', (b: BudgetEntity) => b],
      ['aprovado', (b: BudgetEntity) => b.approve('c-1', TokenRole.CUSTOMER)],
      ['recusado', (b: BudgetEntity) => b.reject('c-1', TokenRole.CUSTOMER)],
    ])('cancela um orçamento %s', (_label, setup) => {
      const budget = BudgetEntity.create(props());
      setup(budget);
      expect(budget.cancel('PAYMENT_TIMEOUT')).toBe(true);
      expect(budget.status).toBe(BudgetStatus.CANCELED);
      expect(budget.cancelReason).toBe('PAYMENT_TIMEOUT');
      expect(budget.canceledAt).toBeInstanceOf(Date);
    });

    it('é idempotente', () => {
      const budget = BudgetEntity.create(props());
      budget.cancel('MANUAL_CANCEL');
      expect(budget.cancel('PAYMENT_TIMEOUT')).toBe(false);
      expect(budget.cancelReason).toBe('MANUAL_CANCEL');
    });
  });

  it('sabe de qual cliente é', () => {
    const budget = BudgetEntity.create(props());
    expect(budget.isOwnedBy('c-1')).toBe(true);
    expect(budget.isOwnedBy('c-2')).toBe(false);
  });
});
