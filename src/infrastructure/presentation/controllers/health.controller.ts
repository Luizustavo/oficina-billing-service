import { Public } from '@infrastructure/presentation/decorators/public.decorator';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@ApiTags('health')
@Public()
@Controller('api/billing/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe: database reachable' })
  async ready() {
    try {
      await this.prisma.$executeRawUnsafe('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok' };
  }
}
