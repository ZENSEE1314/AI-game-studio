import { Body, Controller, Get, Module, Post, Req } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AccountsModule } from '../accounts/accounts.module';
import { AllowInMaintenance, AuthUser, CurrentUser, Public } from '../common/decorators';
import { SystemModule } from '../system/system.module';

export class LoginDto {
  @IsString() @Length(3, 64) username: string;
  @IsString() @MinLength(1) password: string;
  @IsOptional() @Matches(/^\d{6}$/) totp?: string;
}
export class RegisterDto {
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/) username: string;
  @IsEmail() email: string;
  @IsString() @MinLength(10) password: string;
  @IsString() @Length(1, 120) fullName: string;
  @IsOptional() @Matches(/^\+?[0-9]{8,15}$/) phone?: string;
  @IsString() staffUsername: string;
}
export class RefreshDto { @IsString() refreshToken: string; }
export class CodeDto { @Matches(/^\d{6}$/) code: string; }

const meta = (req: any) => ({ ip: req.ip as string, userAgent: req.headers['user-agent'] as string });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('register') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto, @Req() req: any) { return this.auth.register(dto, req.ip); }

  @Public() @AllowInMaintenance() @Post('login') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: any) { return this.auth.login(dto, meta(req)); }

  @Public() @AllowInMaintenance() @Post('refresh') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto, @Req() req: any) { return this.auth.refresh(dto.refreshToken, meta(req)); }

  @AllowInMaintenance() @Post('logout')
  logout(@CurrentUser() u: AuthUser) { return this.auth.logout(u.sessionId); }

  @Get('me') @AllowInMaintenance()
  me(@CurrentUser() u: AuthUser) { return u; }

  @Post('2fa/setup') @AllowInMaintenance()
  setup(@CurrentUser() u: AuthUser) { return this.auth.twoFactorSetup(u.id); }

  @Post('2fa/enable') @AllowInMaintenance()
  enable(@CurrentUser() u: AuthUser, @Body() dto: CodeDto) { return this.auth.twoFactorEnable(u.id, dto.code); }
}

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set (>=32 chars)');
        return { secret, signOptions: { expiresIn: '15m' } };
      },
    }),
    AccountsModule, SystemModule,
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
