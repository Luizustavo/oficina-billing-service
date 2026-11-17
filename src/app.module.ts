import { HealthController } from './infrastructure/presentation/controllers/health.controller';
import { loggingConfig } from './infrastructure/observability/logging.config';
import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';

@Module({
  imports: [LoggerModule.forRoot(loggingConfig())],
  controllers: [HealthController],
})
export class AppModule {}
