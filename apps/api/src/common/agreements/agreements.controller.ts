import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentActor, Public } from '../../modules/identity/auth.guard';
import { Actor } from '../../modules/identity/types';
import { DomainLoaderService } from '../../modules/domains/domain-loader.service';
import { AgreementService } from './agreement.service';

/**
 * Reading an agreement before accepting it, and reading back what you
 * already accepted.
 *
 * The second one matters as much as the first: someone should be able to
 * see what they agreed to, in the words they were shown, without having
 * to ask anyone for it.
 */
@Controller()
export class AgreementsController {
  constructor(
    @Inject(AgreementService) private readonly agreements: AgreementService,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
  ) {}

  /**
   * The wording, before anyone commits to anything. Public, because you
   * cannot ask somebody to agree to terms they must sign in to read.
   */
  @Get('agreements/document')
  @Public()
  async document(
    @Query('domainCode') domainCode: string,
    @Query('code') code: string,
    @Query('lang') lang?: string,
  ): Promise<{ code: string; version: string; text: string; lang: string }> {
    if (!domainCode) throw new BadRequestException('domainCode is required');
    if (!code) throw new BadRequestException('code is required');
    const domain = await this.loader.getDomain(domainCode);
    return this.agreements.documentFor(domain.familyCode, code, lang ?? 'en');
  }

  /** What the caller has agreed to. Scoped to them — there is no "whose?" parameter (#28). */
  @Get('me/agreements')
  async mine(@CurrentActor() actor: Actor): Promise<unknown[]> {
    return this.agreements.listFor(actor.userId);
  }
}
