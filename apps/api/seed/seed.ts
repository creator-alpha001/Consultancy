import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DomainManifestService } from '../src/modules/domains/domain-manifest.service';
import { FamilyManifestService } from '../src/modules/domains/family-manifest.service';
import { civilServicesDomains } from './domains';
import { civilServicesExamsFamily } from './family';

/**
 * Seeds the civil services exam family and its domains.
 *
 * This script uses only the public `domains/` publish API — the same one
 * the admin pack editor calls. It adds no table, touches no core module,
 * and would work identically for a family that had nothing to do with
 * exams. That is the point of M8.
 *
 * Idempotent: publishing a manifest again supersedes the previous
 * version rather than duplicating it, and categories deactivate instead
 * of being deleted, so re-running this is safe.
 *
 * Every domain lands with `publicly_listed = false` (the column
 * default). Nothing here opens a domain to the public — that is a human
 * decision, made per domain, once its exam pattern is confirmed against
 * the current official notification AND it has supply. See
 * PROVENANCE.md, and SPEC-PLATFORM.md §18: "Listing a domain with no
 * providers is worse than not listing it."
 */
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const families = app.get(FamilyManifestService);
    const domains = app.get(DomainManifestService);

    const family = civilServicesExamsFamily();
    await families.publish(family);
    console.log(`family  ${family.code} v${family.version} (${family.skills.length} skills)`);

    const manifests = civilServicesDomains();
    for (const manifest of manifests) {
      await domains.publish(manifest);
      console.log(`domain  ${manifest.code.padEnd(14)} ${manifest.languages.join('/')}`);
    }

    console.log(`\nseeded ${manifests.length} domains, all publicly_listed = false.`);
    console.log('Exam patterns are UNVERIFIED placeholders — see seed/PROVENANCE.md before listing any domain.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
