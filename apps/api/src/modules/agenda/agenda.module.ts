import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';

/** Agendas, items, locking, hashing, change orders. */
@Module({
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
