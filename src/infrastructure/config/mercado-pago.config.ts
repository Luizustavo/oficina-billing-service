import { requiredInProduction } from './required-in-production';

export const mercadoPagoConfig = () => ({
  mercadoPago: {
    accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    webhookSecret: requiredInProduction('MP_WEBHOOK_SECRET', ''),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
    timeoutMs: Number(process.env.MP_TIMEOUT_MS || 10_000),
  },
});
