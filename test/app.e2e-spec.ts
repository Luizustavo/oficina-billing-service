import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { createHmac, randomUUID } from 'crypto';
import { App } from 'supertest/types';

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

describe('Billing Service (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
});
