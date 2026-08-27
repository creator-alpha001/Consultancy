import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { HundredMsSandboxRoomProvider } from './room/hundred-ms-sandbox.provider';
import { ROOM_PROVIDER } from './room/room-provider.interface';
import { SessionService } from './session.service';
import { TranscriptService } from './transcript.service';

/** Booking, room, consent, recording, transcript. */
@Module({
  imports: [AgendaModule],
  providers: [
    SessionService,
    TranscriptService,
    HundredMsSandboxRoomProvider,
    { provide: ROOM_PROVIDER, useExisting: HundredMsSandboxRoomProvider },
  ],
  exports: [SessionService, TranscriptService],
})
export class SessionsModule {}
