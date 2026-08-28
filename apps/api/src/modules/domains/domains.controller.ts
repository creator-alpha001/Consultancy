import { Controller, Get, Inject, Param } from '@nestjs/common';
import { Public } from '../identity/auth.guard';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { CategoryTreeNode } from '../taxonomy/types';
import { DomainLoaderService } from './domain-loader.service';
import { ResolvedDomain, ResolvedFamily } from './types';

/**
 * Read-only. Publishing lives in admin/'s pack editor — this is the
 * "app changes with no deploy" surface: whatever FamilyManifestService
 * or DomainManifestService just published, these routes reflect
 * immediately, from the same cache the rest of the app reads.
 *
 * Deliberately `@Public()`: this is the catalogue an aspirant browses
 * before they have an account, and SPEC-PLATFORM.md wants public pages
 * server-rendered. It exposes labels, categories and price bands — pack
 * data that is published in order to be seen. No user data passes
 * through here, and unlisted domains are still governed by
 * `publicly_listed`.
 */
@Controller()
@Public()
export class DomainsController {
  constructor(
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(TaxonomyService) private readonly taxonomy: TaxonomyService,
  ) {}

  @Get('families/:code')
  async getFamily(@Param('code') code: string): Promise<ResolvedFamily> {
    return this.loader.getFamily(code);
  }

  @Get('domains/:code')
  async getDomain(@Param('code') code: string): Promise<ResolvedDomain> {
    return this.loader.getDomain(code);
  }

  @Get('domains/:code/categories')
  async getCategoryTree(@Param('code') code: string): Promise<CategoryTreeNode[]> {
    await this.loader.getDomain(code); // 404s cleanly if the domain doesn't exist
    return this.taxonomy.getCategoryTree(code);
  }
}
