import { DomainException } from '@shared/exceptions/domain.exceptions';

const DECIMAL_STRING = /^\d+(\.\d{2})?$/;

export class Money {
  private constructor(private readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new DomainException(`Invalid amount in cents: ${cents}`);
    }
    return new Money(cents);
  }

  static fromDecimalString(value: string): Money {
    if (typeof value !== 'string' || !DECIMAL_STRING.test(value)) {
      throw new DomainException(`Invalid money amount: "${value}"`);
    }
    const [units, fraction = '00'] = value.split('.');
    return Money.fromCents(Number(units) * 100 + Number(fraction));
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  times(quantity: number): Money {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new DomainException(`Invalid quantity: ${quantity}`);
    }
    return Money.fromCents(this.cents * quantity);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  get inCents(): number {
    return this.cents;
  }

  toDecimalString(): string {
    const units = Math.floor(this.cents / 100);
    const fraction = String(this.cents % 100).padStart(2, '0');
    return `${units}.${fraction}`;
  }

  toNumber(): number {
    return this.cents / 100;
  }
}
