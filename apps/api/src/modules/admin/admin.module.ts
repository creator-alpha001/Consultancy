import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { PackEditorController } from './pack-editor.controller';

/** Queues, audit, config, pack editor. Only pack editor exists so far. */
@Module({
  imports: [DomainsModule],
  controllers: [PackEditorController],
})
export class AdminModule {}
