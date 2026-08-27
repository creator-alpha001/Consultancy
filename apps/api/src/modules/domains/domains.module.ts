import { Module } from '@nestjs/common';

/**
 * Pack manifests, loader, validation, label resolution. Only this module
 * may read a family/domain manifest — see CLAUDE.md. Built in M2.
 */
@Module({})
export class DomainsModule {}
