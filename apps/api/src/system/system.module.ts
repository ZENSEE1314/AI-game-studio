import { Body, Controller, Get, Injectable, Module, Put } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AllowInMaintenance, AuthUser, CurrentUser, Public, RequirePermissions } from '../common/decorators';

export enum SystemStatus { ACTIVE = 'ACTIVE', MAINTENANCE = 'MAINTENANCE', SUSPENDED = 'SUSPENDED' }
const KEY = 'system.status';

export class SetStatusDto {
  @IsEnum(SystemStatus) status: SystemStatus;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

@Injectable()
export class SystemService {
  private cache: { value: { status: SystemStatus; message: string | null }; at: number } | null = null;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async getStatus() {
    if (this.cache && Date.now() - this.cache.at < 2000) return this.cache.value;
    const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
    const v = (row?.value ?? {}) as { status?: SystemStatus; message?: string };
    const value = { status: v.status ?? SystemStatus.ACTIVE, message: v.message ?? null };
    this.cache = { value, at: Date.now() };
    return value;
  }

  async setStatus(actor: AuthUser, dto: SetStatusDto) {
    const before = await this.getStatus();
    const value = { status: dto.status, message: dto.message ?? null };
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: KEY }, create: { key: KEY, value, updatedById: actor.id },
        update: { value, updatedById: actor.id },
      });
      await this.audit.log({
        actorId: actor.id, action: 'SYSTEM_STATUS_CHANGED', entityType: 'system', entityId: KEY,
        metadata: { from: before.status, to: dto.status, message: dto.message ?? null },
      }, tx);
    });
    this.cache = null;
    return value;
  }
}

@Controller('system')
export class SystemController {
  constructor(private readonly svc: SystemService) {}

  @Public() @AllowInMaintenance() @Get('status')
  status() { return this.svc.getStatus(); }

  @Put('status') @AllowInMaintenance() @RequirePermissions('system:manage')
  set(@CurrentUser() u: AuthUser, @Body() dto: SetStatusDto) { return this.svc.setStatus(u, dto); }
}

@Module({ providers: [SystemService], controllers: [SystemController], exports: [SystemService] })
export class SystemModule {}
