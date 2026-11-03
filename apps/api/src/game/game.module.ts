import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';
import { GameService } from './game.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';
import { MAX_NUMBER, MAX_STAKE, MIN_NUMBER } from './game.math';

class GrantDto {
  @IsUUID() userId: string;
  @IsInt() @Min(1) @Max(MAX_STAKE) amount: number;
  @IsOptional() @IsString() @Length(8, 100) idempotencyKey?: string;
  @IsOptional() @IsString() @Length(0, 200) note?: string;
}
class RoundDto { @IsString() @Length(2, 100) name: string; @IsOptional() @IsInt() @Min(1) @Max(MAX_STAKE) minStake?: number; }
class ResultDto { @IsInt() @Min(MIN_NUMBER) @Max(MAX_NUMBER) number: number; }
class PickDto { @IsInt() number: number; @IsInt() stake: number; }
class PicksDto { @IsArray() @ArrayMaxSize(27) @ValidateNested({ each: true }) @Type(() => PickDto) picks: PickDto[]; }
const page = (p: string, l: string, max = 100) => ({ page: Math.max(1, +p || 1), limit: Math.min(max, Math.max(1, +l || 25)) });

@Controller('wallet')
export class WalletController {
  constructor(private readonly svc: GameService) {}
  @Get('me') @RequirePermissions('wallet:read') me(@CurrentUser() u: AuthUser) { return this.svc.myWallet(u.id); }
  @Get('me/ledger') @RequirePermissions('wallet:read')
  ledger(@CurrentUser() u: AuthUser, @Query('page') p = '1', @Query('limit') l = '25') { const q = page(p, l); return this.svc.myLedger(u.id, q.page, q.limit); }
  @Post('grant') @RequirePermissions('wallet:grant')
  grant(@CurrentUser() u: AuthUser, @Body() d: GrantDto, @Req() req: any) { return this.svc.grant(u, d, req.ip); }
  @Get('balances') @RequirePermissions('wallet:grant')
  balances(@Query('search') s?: string, @Query('page') p = '1', @Query('limit') l = '25') { const q = page(p, l); return this.svc.balances(s, q.page, q.limit); }
}

@Controller('game')
export class GameController {
  constructor(private readonly svc: GameService) {}
  @Get('rounds') @RequirePermissions('system:read') rounds(@CurrentUser() u: AuthUser) { return this.svc.listRounds(u); }
  @Get('leaderboard') @RequirePermissions('system:read') board(@Query('limit') l = '20') { return this.svc.leaderboard(Math.min(100, Math.max(1, +l || 20))); }
  @Get('me/history') @RequirePermissions('game:play') history(@CurrentUser() u: AuthUser) { return this.svc.myHistory(u); }
  @Get('rounds/:id') @RequirePermissions('system:read') round(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getRound(u, id); }

  @Post('rounds') @RequirePermissions('game:manage') create(@CurrentUser() u: AuthUser, @Body() d: RoundDto) { return this.svc.createRound(u, d); }
  @Post('rounds/:id/open') @RequirePermissions('game:manage') open(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.open(u, id); }
  @Post('rounds/:id/lock') @RequirePermissions('game:manage') lock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.lock(u, id); }
  @Post('rounds/:id/cancel') @RequirePermissions('game:manage') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(u, id); }
  @Post('rounds/:id/result') @RequirePermissions('game:manage')
  result(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ResultDto) { return this.svc.setResult(u, id, d.number); }
  @Post('rounds/:id/publish') @RequirePermissions('game:manage') publish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.publish(u, id); }

  @Post('rounds/:id/selections') @RequirePermissions('game:play')
  picks(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: PicksDto) { return this.svc.setSelections(u, id, d.picks); }
}

@Module({ providers: [GameService], controllers: [WalletController, GameController] })
export class GameModule {}
