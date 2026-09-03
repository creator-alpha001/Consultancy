import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DomainManifestService } from '../src/modules/domains/domain-manifest.service';
import { FamilyManifestService } from '../src/modules/domains/family-manifest.service';
import { accountancyDomains, accountancyFamily } from './accountancy';
import { higherEducationDomains, higherEducationFamily } from './higher-education';

/**
 * Publishes two families that have nothing to do with examinations.
 *
 * This exists to TEST a claim rather than to ship demo data. CLAUDE.md
 * says the core is domain-agnostic and that "adding a domain must require
 * zero core code changes"; SPEC-PLATFORM.md §3 says the same. Until now
 * exactly one family had ever been published, so the claim had never been
 * exercised — nineteen UPSC-shaped domains inside one exam family prove
 * far less than one family that is not an exam at all.
 *
 * It uses the same `FamilyManifestService.publish` the admin pack editor
 * calls, adds no table and touches no core module. If it runs, the
 * architecture holds. If it needs a migration or a code change, it does not.
 *
 * Idempotent: republishing supersedes the previous manifest version rather
 * than duplicating it. Every domain lands `publicly_listed = false`.
 */
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const families = app.get(FamilyManifestService);
    const domains = app.get(DomainManifestService);

    for (const [family, manifests] of [
      [accountancyFamily(), accountancyDomains()] as const,
      [higherEducationFamily(), higherEducationDomains()] as const,
    ]) {
      await families.publish(family);
      console.log(
        `family  ${family.code.padEnd(18)} v${family.version}  ` +
          `${family.skills.length} skills · ${family.credentialTypes.length} credential types · ` +
          `${family.assessmentTemplates.length} rubrics`,
      );
      for (const manifest of manifests) {
        await domains.publish(manifest);
        console.log(`  domain  ${manifest.code.padEnd(18)} ${manifest.languages.join('/')}`);
      }
    }

    console.log('\nBoth families published. No migration was run and no core file was changed.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
