import { Module } from '@nestjs/common';
import { EngagementsModule } from '../engagements/engagements.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

/** Agendas, items, locking, hashing, change orders. */
@Module({
  imports: [EngagementsModule],
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
