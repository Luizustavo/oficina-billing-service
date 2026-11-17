import { DomainException } from '@shared/exceptions/domain.exceptions';
import { Money } from './money.value-object';

describe('Money', () => {
  it.each([
    ['195.90', 19590],
    ['0.00', 0],
    ['1500', 150000],
    ['0.05', 5],
  ])('lê "%s" como %i centavos', (value, cents) => {
    expect(Money.fromDecimalString(value).inCents).toBe(cents);
  });

  it.each(['-1.00', '1.5', '1.999', 'abc', '', '1,50', ' 1.00'])(
    'rejeita "%s"',
    (value) => {
      expect(() => Money.fromDecimalString(value)).toThrow(DomainException);
    },
  );

  it('soma sem erro de ponto flutuante (0.10 + 0.20 = 0.30)', () => {
    const total = Money.fromDecimalString('0.10').add(
      Money.fromDecimalString('0.20'),
    );
    expect(total.toDecimalString()).toBe('0.30');
  });

  it('multiplica pela quantidade do item', () => {
    expect(Money.fromDecimalString('45.90').times(3).toDecimalString()).toBe(
      '137.70',
    );
  });

  it.each([-1, 1.5])('rejeita quantidade %p', (quantity) => {
    expect(() => Money.fromDecimalString('1.00').times(quantity)).toThrow(
      DomainException,
    );
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejeita %p centavos',
    (cents) => {
      expect(() => Money.fromCents(cents)).toThrow(DomainException);
    },
  );

  it('formata com duas casas', () => {
    expect(Money.fromCents(5).toDecimalString()).toBe('0.05');
    expect(Money.fromCents(19590).toDecimalString()).toBe('195.90');
    expect(Money.zero().toDecimalString()).toBe('0.00');
  });

  it('converte para número quando a API externa exige', () => {
    expect(Money.fromDecimalString('195.90').toNumber()).toBe(195.9);
  });

  it('compara pelo valor', () => {
    expect(Money.fromDecimalString('10.00').equals(Money.fromCents(1000))).toBe(
      true,
    );
    expect(Money.fromCents(1).equals(Money.fromCents(2))).toBe(false);
  });
});
