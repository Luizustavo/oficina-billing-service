export const mercadoPagoConfig = () => ({
  mercadoPago: {
    accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
    timeoutMs: Number(process.env.MP_TIMEOUT_MS || 10_000),
  },
});
