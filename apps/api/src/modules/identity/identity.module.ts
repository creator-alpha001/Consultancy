import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { MfaPolicyService } from './mfa-policy.service';
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
  imports: [DomainsModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TotpService, SessionService, MfaPolicyService, AuthGuard],
  exports: [AuthService, SessionService, AuthGuard, PasswordService, TotpService, MfaPolicyService],
})
export class IdentityModule {}
