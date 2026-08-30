import { Global, Module } from '@nestjs/common';
import { DomainsModule } from '../../modules/domains/domains.module';
import { AgreementService } from './agreement.service';
import { AgreementsController } from './agreements.controller';

/**
 * Global, and in `common/`, for the same reason as audit and storage:
 * identity, sessions and money all need to record an agreement, and none
 * of them should depend on another feature module to do it.
 */
@Global()
@Module({
  imports: [DomainsModule],
  controllers: [AgreementsController],
  providers: [AgreementService],
  exports: [AgreementService],
})
export class AgreementsModule {}
