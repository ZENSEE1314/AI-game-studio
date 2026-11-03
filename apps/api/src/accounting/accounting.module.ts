import { Body, Controller, Get, Header, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AccountClass, JournalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean,  IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';
import { AccountingService } from './accounting.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
class LineDto {
  @IsUUID() accountId: string;
  @IsOptional() @Matches(/^\d{1,16}(\.\d{1,2})?$/) debit?: string;
  @IsOptional() @Matches(/^\d{1,16}(\.\d{1,2})?$/) credit?: string;
  @IsOptional() @IsString() @Length(0, 200) description?: string;
}
class CreateEntryDto {
  @Matches(DATE) entryDate: string;
  @IsString() @Length(3, 300) description: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => LineDto) lines: LineDto[];
}
class UpdateEntryDto {
  @IsOptional() @Matches(DATE) entryDate?: string;
  @IsOptional() @IsString() @Length(3, 300) description?: string;
  @IsOptional() @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => LineDto) lines?: LineDto[];
}
class CommentDto { @IsOptional() @IsString() @Length(0, 500) comment?: string; }
class RejectDto { @IsString() @Length(3, 500) comment: string; }
class ReverseDto { @IsString() @Length(3, 300) reason: string; @IsOptional() @Matches(DATE) date?: string; }
class AccountDto {
  @Matches(/^[0-9A-Za-z.-]{1,16}$/) code: string;
  @IsString() @Length(2, 120) name: string;
  @IsEnum(AccountClass) class: AccountClass;
}
class ActiveDto { @IsBoolean() isActive: boolean; }
class CashDto {
  @IsOptional() @IsBoolean() isCash?: boolean;
  @IsOptional() @IsIn(['OPERATING', 'INVESTING', 'FINANCING', null]) cashFlowActivity?: 'OPERATING' | 'INVESTING' | 'FINANCING' | null;
}
class ReconDto { @IsUUID() accountId: string; @Matches(DATE) statementDate: string; @Matches(/^-?\d{1,16}(\.\d{1,2})?$/) statementBalance: string; }
class LinesDto { @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) lineIds: string[]; }
class PeriodDto { @IsString() @Length(2, 60) name: string; @Matches(DATE) startDate: string; @Matches(DATE) endDate: string; }

@Controller('accounting')
export class AccountingController {
  constructor(private readonly svc: AccountingService) {}

  @Get('accounts') @RequirePermissions('accounting:read') accounts() { return this.svc.listAccounts(); }
  @Post('accounts') @RequirePermissions('accounting:write')
  createAccount(@CurrentUser() u: AuthUser, @Body() d: AccountDto) { return this.svc.createAccount(u, d); }
  @Patch('accounts/:id') @RequirePermissions('accounting:write')
  setActive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ActiveDto) { return this.svc.setAccountActive(u, id, d.isActive); }

  @Patch('accounts/:id/cash-settings') @RequirePermissions('accounting:write')
  cashSettings(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: CashDto) { return this.svc.setCashSettings(u, id, d); }

  @Get('reconciliations/status') @RequirePermissions('accounting:read') reconStatus() { return this.svc.reconStatus(); }
  @Get('reconciliations') @RequirePermissions('accounting:read') recons(@Query('accountId') accountId?: string) { return this.svc.listRecons(accountId); }
  @Post('reconciliations') @RequirePermissions('accounting:write')
  createRecon(@CurrentUser() u: AuthUser, @Body() d: ReconDto) { return this.svc.createRecon(u, d); }
  @Get('reconciliations/:id') @RequirePermissions('accounting:read')
  recon(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getRecon(id); }
  @Post('reconciliations/:id/clear') @RequirePermissions('accounting:write')
  clear(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: LinesDto) { return this.svc.markLines(u, id, d.lineIds, true); }
  @Post('reconciliations/:id/unclear') @RequirePermissions('accounting:write')
  unclear(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: LinesDto) { return this.svc.markLines(u, id, d.lineIds, false); }
  @Post('reconciliations/:id/complete') @RequirePermissions('accounting:approve')
  completeRecon(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.completeRecon(u, id); }
  @Post('reconciliations/:id/cancel') @RequirePermissions('accounting:write')
  cancelRecon(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancelRecon(u, id); }

  @Get('periods') @RequirePermissions('accounting:read') periods() { return this.svc.listPeriods(); }
  @Post('periods') @RequirePermissions('accounting:write')
  createPeriod(@CurrentUser() u: AuthUser, @Body() d: PeriodDto) { return this.svc.createPeriod(u, d); }
  @Post('periods/:id/close') @RequirePermissions('accounting:approve')
  closePeriod(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.closePeriod(u, id); }

  @Get('journals') @RequirePermissions('accounting:read')
  list(@Query('status') status?: JournalStatus, @Query('from') from?: string, @Query('to') to?: string,
       @Query('page') page = '1', @Query('limit') limit = '25') {
    return this.svc.listEntries({
      status: status && Object.values(JournalStatus).includes(status) ? status : undefined,
      from: from && DATE.test(from) ? from : undefined, to: to && DATE.test(to) ? to : undefined,
      page: Math.max(1, +page || 1), limit: Math.min(100, Math.max(1, +limit || 25)),
    });
  }
  @Post('journals') @RequirePermissions('accounting:write')
  create(@CurrentUser() u: AuthUser, @Body() d: CreateEntryDto) { return this.svc.createEntry(u, d); }
  @Get('journals/:id') @RequirePermissions('accounting:read')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getEntry(id); }
  @Patch('journals/:id') @RequirePermissions('accounting:write')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateEntryDto) { return this.svc.updateDraft(u, id, d); }
  @Post('journals/:id/submit') @RequirePermissions('accounting:write')
  submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.submit(u, id); }
  @Post('journals/:id/approve') @RequirePermissions('accounting:approve')
  approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: CommentDto) { return this.svc.approve(u, id, d.comment); }
  @Post('journals/:id/reject') @RequirePermissions('accounting:approve')
  reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: RejectDto) { return this.svc.reject(u, id, d.comment); }
  @Post('journals/:id/post') @RequirePermissions('accounting:approve')
  post(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.post(u, id); }
  @Post('journals/:id/reverse') @RequirePermissions('accounting:approve')
  reverse(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ReverseDto) { return this.svc.reverse(u, id, d); }

  @Get('reports/trial-balance') @RequirePermissions('accounting:read')
  tb(@Query('asOf') asOf: string) { return this.svc.trialBalance(asOf); }
  @Get('reports/income-statement') @RequirePermissions('accounting:read')
  pl(@Query('from') from: string, @Query('to') to: string) { return this.svc.incomeStatement(from, to); }
  @Get('reports/balance-sheet') @RequirePermissions('accounting:read')
  bs(@Query('asOf') asOf: string) { return this.svc.balanceSheet(asOf); }

  @Get('reports/cash-flow') @RequirePermissions('accounting:read')
  cf(@Query('from') from: string, @Query('to') to: string) { return this.svc.cashFlow(from, to); }

  @Get('reports/:kind/export.csv') @RequirePermissions('accounting:read')
  @Header('content-type', 'text/csv; charset=utf-8') @Header('content-disposition', 'attachment; filename="report.csv"')
  csv(@Param('kind') kind: string,
      @Query('asOf') asOf?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.reportCsv(kind as any, { asOf, from, to });
  }
}

@Module({ providers: [AccountingService], controllers: [AccountingController] })
export class AccountingModule {}
