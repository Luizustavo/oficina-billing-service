import { HttpExceptionFilter } from './infrastructure/presentation/filters/http-exception.filter';
import { HealthController } from './infrastructure/presentation/controllers/health.controller';
import { BillingModule } from './infrastructure/presentation/modules/billing.module';
import { JwtAuthGuard } from './infrastructure/presentation/guards/jwt-auth.guard';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { RolesGuard } from './infrastructure/presentation/guards/roles.guard';
import { loggingConfig } from './infrastructure/observability/logging.config';
import { JwtStrategy } from './infrastructure/config/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { LoggerModule } from 'nestjs-pino';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    LoggerModule.forRoot(loggingConfig()),
    PassportModule,
    PrismaModule,
    MessagingModule,
    BillingModule,
  ],
  controllers: [HealthController],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
