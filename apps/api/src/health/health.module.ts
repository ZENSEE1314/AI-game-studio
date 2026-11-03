import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { AllowInMaintenance, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public() @AllowInMaintenance() @Get()
  async check() {
    try { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException({ status: 'db_unavailable' }); }
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
