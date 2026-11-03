import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermissions } from '../common/decorators';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(
    @Query('page') page = '1', @Query('limit') limit = '50',
    @Query('action') action?: string, @Query('actorId') actorId?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.audit.list({
      page: Math.max(1, +page || 1), limit: Math.min(200, Math.max(1, +limit || 50)),
      action, actorId, entityType,
    });
  }
}

@Global()
@Module({ providers: [AuditService], controllers: [AuditController], exports: [AuditService] })
export class AuditModule {}
