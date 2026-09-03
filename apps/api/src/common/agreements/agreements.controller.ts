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
    @Query('code') code: string,
    @Query('domainCode') domainCode?: string,
    @Query('familyCode') familyCode?: string,
    @Query('lang') lang?: string,
  ): Promise<{ code: string; version: string; text: string; lang: string }> {
    if (!code) throw new BadRequestException('code is required');
    // Agreement documents are FAMILY data — `domainCode` was only ever a
    // way to reach one. Registration happens before anybody is in a
    // domain, so it could not ask for terms without naming an exam it
    // had no reason to name; `familyCode` lets it ask the question it
    // actually has. Either identifies the family; one is required.
    if (!domainCode && !familyCode) {
      throw new BadRequestException('domainCode or familyCode is required');
    }
    const resolved = familyCode ?? (await this.loader.getDomain(domainCode as string)).familyCode;
    return this.agreements.documentFor(resolved, code, lang ?? 'en');
  }

  /** What the caller has agreed to. Scoped to them — there is no "whose?" parameter (#28). */
  @Get('me/agreements')
  async mine(@CurrentActor() actor: Actor): Promise<unknown[]> {
    return this.agreements.listFor(actor.userId);
  }
}
