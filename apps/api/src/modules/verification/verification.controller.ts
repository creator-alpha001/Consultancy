import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentActor, Public, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { CredentialService } from './credential.service';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { ProviderLanguageService, WorkingLanguage } from './provider-language.service';
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
  constructor(
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(ProviderLanguageService) private readonly languages: ProviderLanguageService,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
  ) {}

  // ── Working languages ───────────────────────────────────────────────
  //
  // Not the interface language. This is what work a provider can take
  // on, and it decides who they are matched to (#19).

  /**
   * What a provider may claim, from the pack.
   *
   * Public, like the credential types: it says what languages this
   * platform serves, which is marketing-visible and carries nobody's
   * data.
   */
  @Get('domains/:code/working-languages')
  @Public()
  async offerableLanguages(@Param('code') code: string): Promise<{ languages: string[] }> {
    const domain = await this.loader.getDomain(code);
    return { languages: await this.languages.offerableLanguages(domain.familyCode) };
  }

  @Get('me/languages')
  @Roles('provider')
  async myLanguages(@CurrentActor() actor: Actor): Promise<WorkingLanguage[]> {
    return this.languages.listFor(actor.userId);
  }

  /**
   * Replaces the whole set — see the note on `replace()` about why
   * dropping a language must be as easy as adding one.
   */
  @Post('me/languages')
  @Roles('provider')
  async setMyLanguages(
    @CurrentActor() actor: Actor,
    @Body() body: { domainCode?: string; languages?: Array<{ langCode?: string; canEvaluate?: boolean }> },
  ): Promise<WorkingLanguage[]> {
    if (!Array.isArray(body.languages)) throw new BadRequestException('languages must be an array');
    if (!body.domainCode) throw new BadRequestException('domainCode is required — it resolves the family');

    const domain = await this.loader.getDomain(body.domainCode);
    const languages = body.languages.map((l) => {
      if (!l.langCode) throw new BadRequestException('each language needs a langCode');
      return { langCode: l.langCode, canEvaluate: l.canEvaluate !== false };
    });
    return this.languages.replace(actor.userId, domain.familyCode, languages);
  }

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

  /**
   * The submission form's options. Public: it says what this platform
   * verifies, which is marketing-visible, and carries no evidence and no
   * provider's data.
   */
  @Get('domains/:code/credential-types')
  @Public()
  async submittableTypes(@Param('code') code: string) {
    return this.credentials.submittableTypes(code);
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

  /**
   * The evidence, for the reviewer about to decide.
   *
   * A grant is created for this reviewer and the link lasts five
   * minutes (#29). Both are recorded: a provider's identity document is
   * the most sensitive thing on the platform, and "nobody knows who
   * opened it" is not an acceptable answer later.
   */
  @Get('admin/credentials/:id/document')
  @Roles('admin')
  async document(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
  ): Promise<{ url: string; expiresAt: string; watermark: string }> {
    const link = await this.credentials.reviewerDocumentLink(id, { id: actor.userId, label: actor.userId });
    return { url: link.url, expiresAt: link.expiresAt.toISOString(), watermark: link.watermark };
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
