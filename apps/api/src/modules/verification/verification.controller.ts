import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentActor, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { CredentialService } from './credential.service';
import { ProviderCredentialRow } from './types';

/**
 * The credential pipeline (SPEC-PLATFORM.md §11): submit → automated
 * check → human review → tier assignment.
 *
 * A provider submits their own credentials — `providerId` is the session
 * actor, never a body field. Deciding is admin-only, and an automated
 * check never bypasses a human: `runAutomatedCheck` only ever moves a
 * credential to `under_review`, whatever it finds.
 *
 * Verification documents are never exposed here (#30): a provider reads
 * the CONCLUSION of their own review, and nothing serves the evidence.
 */
@Controller()
export class VerificationController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Post('me/credentials')
  @Roles('provider')
  async submit(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      credentialTypeCode: string;
      domainCode: string;
      skillCodes: string[];
      verifierData?: Record<string, unknown>;
    },
  ): Promise<ProviderCredentialRow> {
    return this.credentials.submit({
      providerId: actor.userId,
      credentialTypeCode: body.credentialTypeCode,
      domainCode: body.domainCode,
      skillCodes: body.skillCodes,
      verifierData: body.verifierData ?? {},
    });
  }

  @Get('me/credentials')
  @Roles('provider')
  async mine(@CurrentActor() actor: Actor): Promise<ProviderCredentialRow[]> {
    return this.credentials.listForProvider(actor.userId);
  }

  /** Whether this provider is currently blocked from paid work (§11's sanction gate). */
  @Get('me/paid-work-status')
  @Roles('provider')
  async paidWorkStatus(@CurrentActor() actor: Actor): Promise<{ blocked: boolean }> {
    return { blocked: await this.credentials.isPaidWorkBlocked(actor.userId) };
  }

  // ── Admin review queue ──────────────────────────────────────────────

  @Get('admin/credentials/queue')
  @Roles('admin')
  async queue(): Promise<ProviderCredentialRow[]> {
    return this.credentials.listAwaitingReview();
  }

  @Post('admin/credentials/:id/automated-check')
  @Roles('admin')
  async runCheck(@Param('id') id: string): Promise<ProviderCredentialRow> {
    return this.credentials.runAutomatedCheck(id);
  }

  /** The human decision. `reviewerId` is the authenticated admin, always. */
  @Post('admin/credentials/:id/decide')
  @Roles('admin')
  async decide(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { decision: 'verified' | 'rejected'; note?: string },
  ): Promise<ProviderCredentialRow> {
    return this.credentials.decide({
      credentialId: id,
      reviewerId: actor.userId,
      decision: body.decision,
      note: body.note,
    });
  }
}
