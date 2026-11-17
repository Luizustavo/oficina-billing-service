import {
  InvalidStatusTransitionException,
  NotFoundException,
} from '@shared/exceptions/domain.exceptions';
import { IBudgetRepository } from '@domain/repositories/budget.repository.interface';
import { IOutboxRepository } from '@domain/repositories/outbox.repository.interface';
import { ITransactionManager } from '@domain/services/transaction-manager.interface';
import { BudgetItemKind, BudgetStatus } from '@domain/enums/budget.enum';
import { BudgetEntity } from '@domain/entities/budget/budget.entity';
import { Money } from '@domain/value-objects/money.value-object';
import { OutgoingMessage, SagaEnvelope } from '@domain/messaging/saga-message';
import { GetOrderBudgetUseCase } from './get-order-budget.use-case';
import { ApproveBudgetUseCase } from './approve-budget.use-case';
import { RejectBudgetUseCase } from './reject-budget.use-case';
import { CreateBudgetUseCase } from './create-budget.use-case';
import { CancelBudgetUseCase } from './cancel-budget.use-case';
import { TokenRole } from '@domain/enums/token-role.enum';
import { Logger } from '@nestjs/common';

const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;
const transactions: ITransactionManager = {
  run: (fn) => fn(),
  afterCommit: (fn) => void fn(),
};
const owner = { id: 'c-1', role: TokenRole.CUSTOMER };
const otherCustomer = { id: 'c-2', role: TokenRole.CUSTOMER };
const attendant = { id: 'u-1', role: TokenRole.ATTENDANT };

const makeBudget = () =>
  BudgetEntity.create(
    {
      orderId: 'o-1',
      sagaId: 's-1',
      orderNumber: 'OS001',
      customer: { id: 'c-1', name: 'Maria', email: 'maria@exemplo.com' },
      vehiclePlate: 'ABC1D23',
      items: [
        {
          kind: BudgetItemKind.SERVICE,
          refId: 'sv-1',
          name: 'Revisão',
          unitPrice: Money.fromDecimalString('100.00'),
          quantity: 1,
        },
      ],
      declaredTotal: Money.fromDecimalString('100.00'),
    },
    'b-1',
  );

function setup(budget: BudgetEntity | null = null) {
  const budgets = {
    create: jest.fn((b: BudgetEntity) => Promise.resolve(b)),
    update: jest.fn((b: BudgetEntity) => Promise.resolve(b)),
    findById: jest.fn().mockResolvedValue(budget),
    findBySagaId: jest.fn().mockResolvedValue(budget),
    findCurrentByOrderId: jest.fn().mockResolvedValue(budget),
  } as jest.Mocked<IBudgetRepository>;
  const published: OutgoingMessage[] = [];
  const outbox: IOutboxRepository = {
    add: (messages) => {
      published.push(...messages);
      return Promise.resolve();
    },
  };
  return { budgets, outbox, published };
}

const command = (
  type: string,
  payload: Record<string, unknown>,
): SagaEnvelope => ({
  messageId: 'm-1',
  sagaId: 's-1',
  orderId: 'o-1',
  type,
  version: 1,
  occurredAt: new Date().toISOString(),
  payload,
});

const createPayload = (totalAmount = '100.00') => ({
  orderNumber: 'OS001',
  customer: { id: 'c-1', name: 'Maria', email: 'maria@exemplo.com' },
  vehiclePlate: 'ABC1D23',
  services: [
    { serviceId: 'sv-1', name: 'Revisão', unitPrice: '100.00', quantity: 1 },
  ],
  parts: [],
  totalAmount,
});

describe('CreateBudgetUseCase', () => {
  it('cria o orçamento e responde billing.budget.created', async () => {
    const { budgets, outbox, published } = setup();
    await new CreateBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute(command('billing.budget.create', createPayload()));

    const created = budgets.create.mock.calls[0][0];
    expect(created.status).toBe(BudgetStatus.AWAITING_APPROVAL);
    expect(created.sagaId).toBe('s-1');
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      exchange: 'saga.events',
      routingKey: 'billing.budget.created',
      envelope: {
        sagaId: 's-1',
        orderId: 'o-1',
        payload: { budgetId: created.id, totalAmount: '100.00' },
      },
    });
  });

  it('responde de novo, sem duplicar, se o orçamento da saga já existe', async () => {
    const { budgets, outbox, published } = setup(makeBudget());
    await new CreateBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute(command('billing.budget.create', createPayload()));
    expect(budgets.create).not.toHaveBeenCalled();
    expect(published[0].routingKey).toBe('billing.budget.created');
  });

  it.each([
    ['total que não bate', createPayload('99.99'), 'TOTAL_MISMATCH'],
    [
      'payload sem cliente',
      { ...createPayload(), customer: null },
      'INVALID_PAYLOAD',
    ],
  ])('responde creation-failed com %s', async (_label, payload, reason) => {
    const { budgets, outbox, published } = setup();
    await new CreateBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute(command('billing.budget.create', payload));
    expect(budgets.create).not.toHaveBeenCalled();
    expect(published[0]).toMatchObject({
      routingKey: 'billing.budget.creation-failed',
      envelope: { payload: { reason } },
    });
  });

  it('deixa erro inesperado subir para a retentativa', async () => {
    const { budgets, outbox } = setup();
    budgets.create.mockRejectedValue(new Error('banco fora'));
    await expect(
      new CreateBudgetUseCase(budgets, outbox, transactions, logger).execute(
        command('billing.budget.create', createPayload()),
      ),
    ).rejects.toThrow('banco fora');
  });
});

describe('CancelBudgetUseCase', () => {
  it('cancela e responde billing.budget.canceled com o motivo', async () => {
    const budget = makeBudget();
    const { budgets, outbox, published } = setup(budget);
    await new CancelBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute(command('billing.budget.cancel', { reason: 'PAYMENT_TIMEOUT' }));
    expect(budget.status).toBe(BudgetStatus.CANCELED);
    expect(budgets.update).toHaveBeenCalledWith(budget);
    expect(published[0]).toMatchObject({
      routingKey: 'billing.budget.canceled',
      envelope: { payload: { budgetId: 'b-1', reason: 'PAYMENT_TIMEOUT' } },
    });
  });

  it('é idempotente: já cancelado, só responde de novo', async () => {
    const budget = makeBudget();
    budget.cancel('MANUAL_CANCEL');
    const { budgets, outbox, published } = setup(budget);
    await new CancelBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute(command('billing.budget.cancel', { reason: 'MANUAL_CANCEL' }));
    expect(budgets.update).not.toHaveBeenCalled();
    expect(published[0].routingKey).toBe('billing.budget.canceled');
  });

  it('sem orçamento (a criação falhou), confirma o cancelamento mesmo assim', async () => {
    const { outbox, budgets, published } = setup(null);
    await new CancelBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute(command('billing.budget.cancel', {}));
    expect(published[0]).toMatchObject({
      routingKey: 'billing.budget.canceled',
      envelope: { payload: { budgetId: null, reason: 'UNSPECIFIED' } },
    });
  });
});

describe('GetOrderBudgetUseCase', () => {
  it('o dono vê o orçamento da OS', async () => {
    const { budgets } = setup(makeBudget());
    const result = await new GetOrderBudgetUseCase(budgets, logger).execute(
      'o-1',
      owner,
    );
    expect(result).toMatchObject({ id: 'b-1', totalAmount: '100.00' });
    expect(result.items[0]).toEqual({
      kind: 'SERVICE',
      name: 'Revisão',
      unitPrice: '100.00',
      quantity: 1,
      total: '100.00',
    });
  });

  it('a equipe vê o orçamento de qualquer cliente', async () => {
    const { budgets } = setup(makeBudget());
    await expect(
      new GetOrderBudgetUseCase(budgets, logger).execute('o-1', attendant),
    ).resolves.toMatchObject({ id: 'b-1' });
  });

  it.each([
    ['de outro cliente', makeBudget()],
    ['inexistente', null],
  ])('orçamento %s devolve o mesmo 404', async (_label, budget) => {
    const { budgets } = setup(budget);
    await expect(
      new GetOrderBudgetUseCase(budgets, logger).execute('o-1', otherCustomer),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ApproveBudgetUseCase e RejectBudgetUseCase', () => {
  it('o dono aprova e o evento leva quem aprovou', async () => {
    const { budgets, outbox, published } = setup(makeBudget());
    const result = await new ApproveBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute('b-1', owner);

    expect(result.status).toBe('APPROVED');
    expect(published[0]).toMatchObject({
      routingKey: 'billing.budget.approved',
      envelope: {
        payload: {
          budgetId: 'b-1',
          approvedBy: 'c-1',
          approvedByRole: 'CUSTOMER',
        },
      },
    });
    expect(
      (published[0].envelope.payload as { approvedAt: string }).approvedAt,
    ).toEqual(expect.any(String));
  });

  it('o dono recusa com motivo', async () => {
    const { budgets, outbox, published } = setup(makeBudget());
    const result = await new RejectBudgetUseCase(
      budgets,
      outbox,
      transactions,
      logger,
    ).execute('b-1', owner, 'Caro demais');

    expect(result.status).toBe('REJECTED');
    expect(published[0]).toMatchObject({
      routingKey: 'billing.budget.rejected',
      envelope: {
        payload: { budgetId: 'b-1', rejectedBy: 'c-1', reason: 'Caro demais' },
      },
    });
  });

  it('outro cliente não aprova, e nada é publicado', async () => {
    const { budgets, outbox, published } = setup(makeBudget());
    await expect(
      new ApproveBudgetUseCase(budgets, outbox, transactions, logger).execute(
        'b-1',
        otherCustomer,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(budgets.update).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('não decide duas vezes', async () => {
    const budget = makeBudget();
    budget.approve('c-1', TokenRole.CUSTOMER);
    const { budgets, outbox } = setup(budget);
    await expect(
      new RejectBudgetUseCase(budgets, outbox, transactions, logger).execute(
        'b-1',
        owner,
      ),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionException);
  });
});
