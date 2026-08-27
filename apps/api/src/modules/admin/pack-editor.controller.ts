import { Body, Controller, Inject, Post, Req, UseInterceptors } from '@nestjs/common';
import { Request } from 'express';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { DomainManifestService } from '../domains/domain-manifest.service';
import { FamilyManifestService } from '../domains/family-manifest.service';
import { ResolvedDomain, ResolvedFamily } from '../domains/types';

/**
 * The admin pack editor's HTTP surface (CLAUDE.md — admin/ owns "pack
 * editor"). This controller never parses a manifest itself — it hands
 * the raw body straight to domains/, which is the only module allowed
 * to (module boundary rule). Ops-only; no rbac yet since identity/ isn't
 * built, same caveat as money's internal controller in M1.
 */
@Controller('admin')
export class PackEditorController {
  constructor(
    @Inject(FamilyManifestService) private readonly families: FamilyManifestService,
    @Inject(DomainManifestService) private readonly domains: DomainManifestService,
  ) {}

  @Post('families/manifest')
  @UseInterceptors(IdempotencyInterceptor)
  async publishFamily(@Body() body: unknown, @Req() req: Request): Promise<ResolvedFamily> {
    return this.families.publish(body, req.header('x-published-by') ?? undefined);
  }

  @Post('domains/manifest')
  @UseInterceptors(IdempotencyInterceptor)
  async publishDomain(@Body() body: unknown, @Req() req: Request): Promise<ResolvedDomain> {
    return this.domains.publish(body, req.header('x-published-by') ?? undefined);
  }
}
