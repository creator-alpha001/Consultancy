import { Body, Controller, Get, Inject, Param, Post, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { CurrentActor, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { DomainManifestService } from '../domains/domain-manifest.service';
import { FamilyManifestService } from '../domains/family-manifest.service';
import { ResolvedDomain, ResolvedFamily } from '../domains/types';

/**
 * The admin pack editor's HTTP surface (CLAUDE.md — admin/ owns "pack
 * editor"). This controller never parses a manifest itself — it hands
 * the raw body straight to domains/, which is the only module allowed
 * to (module boundary rule).
 *
 * Now genuinely admin-only: `@Roles('admin')` is checked against the
 * session's user, and since admins must hold a second factor (#32,
 * enforced by trigger), reaching this controller at all implies a 2FA'd
 * human. Publishing a manifest changes what every seeker sees, so the
 * publisher is recorded from the authenticated actor rather than from
 * the `x-published-by` header it used to trust.
 */
@Controller('admin')
@Roles('admin')
export class PackEditorController {
  constructor(
    @Inject(FamilyManifestService) private readonly families: FamilyManifestService,
    @Inject(DomainManifestService) private readonly domains: DomainManifestService,
  ) {}

  /**
   * The manifest an editor is about to change.
   *
   * A pass-through: this controller does not parse it — module boundary,
   * only domains/ may — it hands the stored document to the editor that
   * will publish a new version of it. Admin-only because publishing is,
   * not because a manifest is secret: it is the same document the public
   * `/domains/:code` is derived from.
   */
  @Get('domains/:code/manifest')
  async getDomainManifest(@Param('code') code: string): Promise<Record<string, unknown>> {
    return this.domains.getRawManifest(code);
  }

  @Post('families/manifest')
  @UseInterceptors(IdempotencyInterceptor)
  async publishFamily(@Body() body: unknown, @CurrentActor() actor: Actor): Promise<ResolvedFamily> {
    return this.families.publish(body, actor.userId);
  }

  @Post('domains/manifest')
  @UseInterceptors(IdempotencyInterceptor)
  async publishDomain(@Body() body: unknown, @CurrentActor() actor: Actor): Promise<ResolvedDomain> {
    return this.domains.publish(body, actor.userId);
  }
}
