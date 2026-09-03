import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { Actor } from '../identity/types';
import { CurrentActor, Public, Roles } from '../identity/auth.guard';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { CategoryTreeNode } from '../taxonomy/types';
import { CatalogueService } from './catalogue.service';
import { DomainLoaderService } from './domain-loader.service';
import { MyDomain, MyDomainsService } from './my-domains.service';
import { CatalogueFamily, DomainReadiness, ResolvedDomain, ResolvedFamily } from './types';

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
 * through here.
 *
 * `GET /catalogue` is the browse surface, and it returns listed, active
 * domains only. Fetching one BY CODE stays open even when it is unlisted:
 * an unlisted domain is not a secret, it is one that has not earned a
 * place on the shelf, and a direct link to it must keep working while a
 * family is being prepared. The distinction is deliberate — see
 * CatalogueService, which is where the listing gate lives.
 */
@Controller()
@Public()
export class DomainsController {
  constructor(
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(TaxonomyService) private readonly taxonomy: TaxonomyService,
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}

  /**
   * Everything a visitor may browse, grouped by family.
   *
   * This is what makes a second family reachable. Before it existed the
   * only way to find a domain was to already know its code, so the web
   * app carried a hardcoded list — which meant publishing a family
   * changed the database and nothing else, and "adding a domain requires
   * zero core code changes" stopped being true one layer above the API.
   */
  @Get('catalogue')
  async getCatalogue(): Promise<CatalogueFamily[]> {
    return this.catalogue.publicCatalogue();
  }

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

/**
 * The ops half of the catalogue: every family and domain regardless of
 * state, with the supply numbers that decide what to open next.
 *
 * A separate controller rather than a query parameter on the public one.
 * `@Public()` is applied at class level above, and a route that had to
 * opt out of it to become admin-only would be one decorator away from
 * exposing every unlisted domain — including a family being prepared
 * before launch. Two classes, two visibilities, no shared default.
 */
@Controller('admin/catalogue')
@Roles('admin')
export class CatalogueOpsController {
  constructor(@Inject(CatalogueService) private readonly catalogue: CatalogueService) {}

  @Get()
  async list(): Promise<DomainReadiness[]> {
    return this.catalogue.opsCatalogue();
  }

  /**
   * Open or close a domain to the public.
   *
   * The supply floor is NOT enforced here — see CatalogueService. A
   * domain below its floor can still be opened, deliberately, and the
   * audit entry records the number it was opened at.
   */
  @Post(':code/listing')
  async setListing(
    @Param('code') code: string,
    @Body() body: { publiclyListed?: boolean },
    @CurrentActor() actor: Actor,
  ): Promise<DomainReadiness> {
    return this.catalogue.setListing({
      domainCode: code,
      publiclyListed: body.publiclyListed === true,
      actorId: actor.userId,
      actorRole: actor.role,
    });
  }
}

/**
 * The domains the person making the request is actually in.
 *
 * A third controller, not a route on either of the two above. The public
 * one is `@Public()` at class level, and this answer is about a named
 * person — mixing them would put a per-user query one decorator away
 * from being anonymous. The ops one is admin-only, and every role needs
 * this.
 *
 * The actor is taken from the session, never from the request (#28).
 * There is deliberately no `?userId=`: this route can only ever answer
 * for whoever is asking.
 */
@Controller('me')
export class MyDomainsController {
  constructor(@Inject(MyDomainsService) private readonly mine: MyDomainsService) {}

  @Get('domains')
  async list(@CurrentActor() actor: Actor): Promise<MyDomain[]> {
    return this.mine.forActor(actor);
  }
}
