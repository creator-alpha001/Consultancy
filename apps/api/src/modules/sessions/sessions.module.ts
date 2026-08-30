import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { EngagementsModule } from '../engagements/engagements.module';
import { HundredMsSandboxRoomProvider } from './room/hundred-ms-sandbox.provider';
import { ROOM_PROVIDER } from './room/room-provider.interface';
import { AvailabilityService } from './availability.service';
import { SessionRoomService } from './session-room.service';
import { SessionService } from './session.service';
import { SessionsController } from './sessions.controller';
import { TranscriptService } from './transcript.service';

/** Booking, room, consent, recording, transcript. */
@Module({
  imports: [AgendaModule, EngagementsModule],
  controllers: [SessionsController],
  providers: [
    SessionService,
    AvailabilityService,
    SessionRoomService,
    TranscriptService,
    HundredMsSandboxRoomProvider,
    { provide: ROOM_PROVIDER, useExisting: HundredMsSandboxRoomProvider },
  ],
  exports: [SessionService, AvailabilityService, SessionRoomService, TranscriptService],
})
export class SessionsModule {}
