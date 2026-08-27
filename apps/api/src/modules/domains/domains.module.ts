import { Module } from '@nestjs/common';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { DomainLoaderService } from './domain-loader.service';
import { DomainManifestService } from './domain-manifest.service';
import { DomainsController } from './domains.controller';
import { FamilyManifestService } from './family-manifest.service';

/**
 * Only this module reads pack manifests (CLAUDE.md module boundary
 * rule). Everything it exports is already-resolved config or a
 * publish/validate entry point — never a raw manifest handed to a
 * caller to parse itself.
 */
@Module({
  imports: [TaxonomyModule],
  controllers: [DomainsController],
  providers: [DomainLoaderService, FamilyManifestService, DomainManifestService],
  exports: [DomainLoaderService, FamilyManifestService, DomainManifestService],
})
export class DomainsModule {}
