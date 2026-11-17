import { BillingMetrics } from './billing.metrics';
import { metrics } from '@opentelemetry/api';

const add = jest.fn();

describe('BillingMetrics', () => {
  beforeEach(() => {
    add.mockClear();
    jest.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add }),
    } as unknown as ReturnType<typeof metrics.getMeter>);
  });

  afterEach(() => jest.restoreAllMocks());

  it('counts a payment entering a status', () => {
    new BillingMetrics().recordPaymentStatus('APPROVED');

    expect(add).toHaveBeenCalledWith(1, { status: 'APPROVED' });
  });

  it('counts a webhook by outcome', () => {
    new BillingMetrics().recordWebhook('invalid_signature');

    expect(add).toHaveBeenCalledWith(1, { outcome: 'invalid_signature' });
  });
});
