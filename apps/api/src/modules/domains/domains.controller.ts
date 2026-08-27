import { Controller, Get, Inject, Param } from '@nestjs/common';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { CategoryTreeNode } from '../taxonomy/types';
import { DomainLoaderService } from './domain-loader.service';
import { ResolvedDomain, ResolvedFamily } from './types';

/**
 * Read-only. Publishing lives in admin/'s pack editor — this is the
 * "app changes with no deploy" surface: whatever FamilyManifestService
 * or DomainManifestService just published, these routes reflect
 * immediately, from the same cache the rest of the app reads.
 */
@Controller()
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
