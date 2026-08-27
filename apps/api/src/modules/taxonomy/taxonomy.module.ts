import { Module } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';

/** Categories, category_skills. See CLAUDE.md module boundaries. */
@Module({
  providers: [TaxonomyService],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
