import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { AccountService } from './account.service';
import { AuthController } from './auth.controller';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { SecretBox } from './secret-box';
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
  controllers: [AuthController, ProfileController],
  providers: [
    { provide: SecretBox, useFactory: () => new SecretBox() },
    AuthService, AccountService, ProfileService, PasswordService, TotpService, SessionService, MfaPolicyService, AuthGuard],
  exports: [AuthService, AccountService, ProfileService, SessionService, AuthGuard, PasswordService, TotpService, MfaPolicyService],
})
export class IdentityModule {}
