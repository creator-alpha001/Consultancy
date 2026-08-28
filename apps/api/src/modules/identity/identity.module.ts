import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';

/**
 * Auth, users, roles, sessions.
 *
 * Exports `SessionService` and `AuthGuard` so every other module's
 * controllers can authenticate without reimplementing any of it — and so
 * there is exactly one place that decides who a request is from.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TotpService, SessionService, AuthGuard],
  exports: [AuthService, SessionService, AuthGuard, PasswordService, TotpService],
})
export class IdentityModule {}
