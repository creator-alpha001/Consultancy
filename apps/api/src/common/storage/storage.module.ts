import { Global, Module } from '@nestjs/common';
import { AttachmentService } from './attachment.service';
import { AttachmentsController } from './attachments.controller';
import { LocalDiskStorage } from './local-disk.storage';
import { OBJECT_STORAGE } from './object-storage.interface';

/**
 * Private file storage and its access model.
 *
 * Global, and in `common/` rather than a module of its own, for the same
 * reason as `AuditService`: verification, assessment and disputes all
 * need to hand out access to a document, and none of them should have to
 * depend on another feature module to do it. CLAUDE.md's module list has
 * no `storage/` — this is infrastructure, not a domain.
 */
@Global()
@Module({
  controllers: [AttachmentsController],
  providers: [LocalDiskStorage, AttachmentService, { provide: OBJECT_STORAGE, useExisting: LocalDiskStorage }],
  exports: [AttachmentService, OBJECT_STORAGE],
})
export class StorageModule {}
