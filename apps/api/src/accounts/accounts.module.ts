import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, MinLength } from 'class-validator';
import { AccountsService } from './accounts.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';

export class CreateAccountDto {
  @IsEnum(Role) role: Role;
  @IsOptional() @IsUUID() parentId?: string;
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/) username: string;
  @IsEmail() email: string;
  @IsString() @MinLength(10) password: string;
  @IsString() @Length(1, 120) fullName: string;
  @IsOptional() @Matches(/^\+?[0-9]{8,15}$/) phone?: string;
}
export class ReasonDto { @IsString() @Length(5, 500) reason: string; }

@Controller('accounts')
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get() @RequirePermissions('accounts:read')
  list(
    @CurrentUser() u: AuthUser,
    @Query('role') role?: Role, @Query('status') status?: 'ACTIVE' | 'SUSPENDED',
    @Query('search') search?: string, @Query('parentId') parentId?: string,
    @Query('page') page = '1', @Query('limit') limit = '25',
  ) {
    return this.svc.list(u, {
      role: role && Object.values(Role).includes(role) ? role : undefined,
      status: status === 'ACTIVE' || status === 'SUSPENDED' ? status : undefined,
      search, parentId,
      page: Math.max(1, +page || 1), limit: Math.min(100, Math.max(1, +limit || 25)),
    });
  }

  @Post() @RequirePermissions('accounts:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAccountDto, @Req() req: any) {
    return this.svc.create(u, dto, req.ip);
  }

  @Get(':id') @RequirePermissions('accounts:read')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Get(':id/history') @RequirePermissions('accounts:read')
  history(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.history(u, id); }

  @Get(':id/suspension-preview') @RequirePermissions('accounts:suspend')
  preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.suspensionPreview(u, id); }

  @Post(':id/suspend') @RequirePermissions('accounts:suspend')
  suspend(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: any) {
    return this.svc.suspend(u, id, dto.reason, req.ip);
  }

  @Post(':id/reactivate') @RequirePermissions('accounts:suspend')
  reactivate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: any) {
    return this.svc.reactivate(u, id, dto.reason, req.ip);
  }
}

@Module({ providers: [AccountsService], controllers: [AccountsController], exports: [AccountsService] })
export class AccountsModule {}
