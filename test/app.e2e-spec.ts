import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IPaymentGateway } from '../src/domain/services/payment-gateway.interface';
import { Money } from '../src/domain/value-objects/money.value-object';
import { AppModule } from './../src/app.module';
import { createHmac, randomUUID } from 'node:crypto';
import { App } from 'supertest/types';

const WEBHOOK_SECRET = 'e2e-webhook-secret';
process.env.MP_WEBHOOK_SECRET = WEBHOOK_SECRET;

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const tokenFor = (role: string, sub = randomUUID()): string => {
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64url({
    sub,
    email: 'teste@exemplo.com',
    role,
    name: 'Teste',
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const signature = createHmac(
    'sha256',
    process.env.JWT_SECRET ?? 'dev-jwt-secret',
  )
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
};

const mercadoPagoSignature = (dataId: string, requestId: string): string => {
  const ts = Date.now().toString();
  const hash = createHmac('sha256', WEBHOOK_SECRET)
    .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  return `ts=${ts},v1=${hash}`;
};

describe('Billing Service (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const gateway: Partial<IPaymentGateway> = {
      getPayment: () =>
        Promise.resolve({
          mpPaymentId: '123456',
          status: 'pending',
          amount: Money.zero(),
        }),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IPaymentGateway)
      .useValue(gateway)
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('health é público e confere o banco', async () => {
    await request(app.getHttpServer())
      .get('/api/billing/health/live')
      .expect(200, { status: 'ok' });
    await request(app.getHttpServer())
      .get('/api/billing/health/ready')
      .expect(200, { status: 'ok' });
  });

  it('orçamento sem token: 401', () =>
    request(app.getHttpServer())
      .get(`/api/billing/orders/${randomUUID()}/budget`)
      .expect(401));

  it('mecânico não decide orçamento: 403', () =>
    request(app.getHttpServer())
      .post(`/api/billing/budgets/${randomUUID()}/approve`)
      .set('authorization', `Bearer ${tokenFor('MECHANIC')}`)
      .expect(403));

  it('cliente com token válido, OS sem orçamento: 404', () =>
    request(app.getHttpServer())
      .get(`/api/billing/orders/${randomUUID()}/budget`)
      .set('authorization', `Bearer ${tokenFor('CUSTOMER')}`)
      .expect(404));

  it('motivo da recusa com campo desconhecido: 400', () =>
    request(app.getHttpServer())
      .post(`/api/billing/budgets/${randomUUID()}/reject`)
      .set('authorization', `Bearer ${tokenFor('CUSTOMER')}`)
      .send({ reason: 'caro', extra: true })
      .expect(400));

  describe('webhook do Mercado Pago', () => {
    const notify = () =>
      request(app.getHttpServer())
        .post('/api/billing/webhooks/mercadopago?data.id=123456&type=payment')
        .send({
          type: 'payment',
          action: 'payment.updated',
          data: { id: '123456' },
        });

    it.each([
      [
        'IPN antigo de pagamento',
        '?id=123456&topic=payment',
        { resource: '123456', topic: 'payment' },
      ],
      [
        'merchant order',
        '?id=987&topic=merchant_order',
        {
          resource: 'https://api.mercadolibre.com/merchant_orders/987',
          topic: 'merchant_order',
        },
      ],
    ])('%s sem assinatura: 200 e ignorado', async (_label, query, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/billing/webhooks/mercadopago${query}`)
        .send(body);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true, outcome: 'ignored' });
    });

    it('sem assinatura: 401', async () => {
      const response = await notify();
      expect(response.status).toBe(401);
    });

    it('assinatura de outro segredo: 401', async () => {
      const response = await notify()
        .set('x-request-id', 'req-1')
        .set('x-signature', `ts=${Date.now()},v1=${'0'.repeat(64)}`);
      expect(response.status).toBe(401);
    });

    it('assinatura válida: 200, mesmo com campos que não conhecemos no corpo', async () => {
      const response = await notify()
        .set('x-request-id', 'req-2')
        .set('x-signature', mercadoPagoSignature('123456', 'req-2'))
        .expect(200);
      expect(response.body).toEqual({ received: true, outcome: 'ignored' });
    });
  });

  it('pagamento sem token: 401', () =>
    request(app.getHttpServer())
      .get(`/api/billing/orders/${randomUUID()}/payment`)
      .expect(401));
});
