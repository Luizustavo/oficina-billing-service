// Precisa ser o primeiro import: o OpenTelemetry instrumenta http/express/nest
// só se carregar antes deles.
import 'dotenv/config';
import { startTracing } from './infrastructure/observability/tracing';

startTracing();

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Oficina - Billing Service')
    .setDescription(
      'Orçamento, aprovação, pagamento (Mercado Pago Checkout Pro) e estorno das ordens de serviço.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/billing/docs',
    app,
    SwaggerModule.createDocument(app, config),
    {
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
      customSiteTitle: 'Oficina - Billing Service',
    },
  );

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`Billing Service ouvindo na porta ${port}`);
}
void bootstrap();
