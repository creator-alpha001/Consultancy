import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { CatalogueService } from './catalogue.service';
import { DomainLoaderService } from './domain-loader.service';
import { DomainManifestService } from './domain-manifest.service';
import { CatalogueOpsController, DomainsController, MyDomainsController } from './domains.controller';
import { FamilyManifestService } from './family-manifest.service';
import { MyDomainsService } from './my-domains.service';

/**
 * Only this module reads pack manifests (CLAUDE.md module boundary
 * rule). Everything it exports is already-resolved config or a
 * publish/validate entry point — never a raw manifest handed to a
 * caller to parse itself.
 */
@Module({
  imports: [TaxonomyModule, AuditModule],
  controllers: [DomainsController, CatalogueOpsController, MyDomainsController],
  providers: [DomainLoaderService, FamilyManifestService, DomainManifestService, CatalogueService, MyDomainsService],
  exports: [DomainLoaderService, FamilyManifestService, DomainManifestService, CatalogueService, MyDomainsService],
})
export class DomainsModule {}
