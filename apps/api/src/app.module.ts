import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.service';
import { AuditModule } from './audit/audit.module';
import { SystemModule } from './system/system.module';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { AccountingModule } from './accounting/accounting.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard, MaintenanceGuard, PermissionsGuard } from './auth/guards';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule, AuditModule, SystemModule, AccountsModule, AuthModule, HealthModule, AccountingModule, GameModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
