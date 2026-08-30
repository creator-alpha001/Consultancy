import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AllowsEnrolmentScope, CurrentActor, Public } from './auth.guard';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { Actor, EnrolFactorResult, LoginResult, RecoveryCodesResult, SessionRow, UserRow } from './types';

/**
 * The first real HTTP surface in this codebase, and the one that makes
 * the others possible.
 *
 * Note what no endpoint here accepts: a user id. Every authenticated
 * route derives the actor from the session (`@CurrentActor`), so there
 * is no request shape in which a client can nominate whose account it is
 * acting on (CLAUDE.md #28).
 */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
  ) {}

  /** Coarse client provenance for the auth audit — never a full IP kept for analytics. */
  private provenance(req: Request): { userAgent?: string; ipPrefix?: string } {
    const ip = req.ip ?? '';
    const ipPrefix = ip.includes(':')
      ? ip.split(':').slice(0, 3).join(':') // IPv6 /48-ish
      : ip.split('.').slice(0, 3).join('.'); // IPv4 /24
    return { userAgent: req.header('user-agent')?.slice(0, 300), ipPrefix: ipPrefix || undefined };
  }

  @Post('register')
  @Public()
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      role: UserRow['role'];
      confirmsAdult: boolean;
      /** Which pack's wording was on the screen, so the acceptance records it. */
      domainCode?: string;
      lang?: string;
    },
  ): Promise<UserRow> {
    // The domain resolves the family whose agreement wording was shown.
    // Optional rather than required, because refusing a registration
    // over a missing display hint would be the wrong trade — but without
    // it only the bare timestamp is kept, which is the weaker record
    // this exists to move away from.
    const familyCode = body.domainCode
      ? (await this.loader.getDomain(body.domainCode).catch(() => null))?.familyCode
      : undefined;

    return this.auth.register({
      email: body.email,
      password: body.password,
      role: body.role,
      confirmsAdult: body.confirmsAdult === true,
      familyCode,
      lang: body.lang,
    });
  }

  /**
   * Returns either a session token or, for an account with a second
   * factor, a `MFA_REQUIRED` error. The client resubmits with `totpCode`.
   */
  @Post('login')
  @Public()
  async login(
    @Body() body: { email: string; password: string; totpCode?: string; recoveryCode?: string },
    @Req() req: Request,
  ): Promise<LoginResult> {
    return this.auth.login({
      email: body.email,
      password: body.password,
      totpCode: body.totpCode,
      recoveryCode: body.recoveryCode,
      ...this.provenance(req),
    });
  }

  @Post('logout')
  async logout(@CurrentActor() actor: Actor): Promise<{ ok: true }> {
    await this.sessions.revoke(actor.sessionId);
    return { ok: true };
  }

  /** Sign out everywhere else — the first move after a suspected compromise. */
  @Post('logout-others')
  async logoutOthers(@CurrentActor() actor: Actor): Promise<{ revoked: number }> {
    return { revoked: await this.sessions.revokeAllForUser(actor.userId, actor.sessionId) };
  }

  @Get('me')
  async me(@CurrentActor() actor: Actor): Promise<UserRow | null> {
    return this.auth.getUser(actor.userId);
  }

  @Get('sessions')
  async listSessions(@CurrentActor() actor: Actor): Promise<SessionRow[]> {
    return this.sessions.listActiveForUser(actor.userId);
  }

  /**
   * Step one of 2FA enrolment. Mandatory for providers and admins (#32).
   * Reachable with an enrolment ticket, so a brand-new provider who
   * cannot yet log in can still get set up.
   */
  @Post('mfa/enrol')
  @AllowsEnrolmentScope()
  async beginEnrolment(@CurrentActor() actor: Actor): Promise<EnrolFactorResult> {
    return this.auth.beginFactorEnrolment(actor.userId);
  }

  /**
   * Step two: prove the authenticator works, and receive recovery codes
   * once. Confirming burns the enrolment ticket — from here the user
   * logs in normally, with their code.
   */
  @Post('mfa/confirm')
  @AllowsEnrolmentScope()
  async confirmEnrolment(
    @CurrentActor() actor: Actor,
    @Body() body: { code: string },
  ): Promise<RecoveryCodesResult> {
    return this.auth.confirmFactorEnrolment(actor.userId, body.code);
  }

  @Post('mfa/recovery-codes')
  async regenerateRecoveryCodes(@CurrentActor() actor: Actor): Promise<RecoveryCodesResult> {
    return this.auth.regenerateRecoveryCodes(actor.userId);
  }
}
