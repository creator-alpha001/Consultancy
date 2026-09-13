import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { EngagementsModule } from '../engagements/engagements.module';
import { MoneyModule } from '../money/money.module';
import { DomainsModule } from '../domains/domains.module';
import { AgoraCloudRecordingProvider } from './room/agora-cloud-recording.provider';
import { AgoraRoomProvider } from './room/agora-room.provider';
import { agoraConfigFromEnv } from './room/agora.config';
import { HundredMsSandboxRoomProvider } from './room/hundred-ms-sandbox.provider';
import { RECORDING_PROVIDER, RecordingProvider } from './room/recording-provider.interface';
import { ROOM_PROVIDER, RoomProvider } from './room/room-provider.interface';
import { SandboxRecordingProvider } from './room/sandbox-recording.provider';
import { AvailabilityService } from './availability.service';
import { SessionExtensionService } from './session-extension.service';
import { SessionRoomService } from './session-room.service';
import { SessionService } from './session.service';
import { SessionsController } from './sessions.controller';
import { TranscriptService } from './transcript.service';
import { SessionViewService } from './session-view.service';

/**
 * The room vendor and its recorder are chosen together, at boot, from
 * `ROOM_PROVIDER`. They are never mixed: a sandbox room with a real
 * recorder would record an empty channel, and a real room with a sandbox
 * recorder would claim to record a call it is not.
 */
const agora = agoraConfigFromEnv();

/** Booking, room, consent, recording, transcript. */
@Module({
  imports: [AgendaModule, EngagementsModule, MoneyModule, DomainsModule],
  controllers: [SessionsController],
  providers: [
    SessionViewService,
    SessionService,
    AvailabilityService,
    SessionRoomService,
    SessionExtensionService,
    TranscriptService,
    HundredMsSandboxRoomProvider,
    {
      provide: ROOM_PROVIDER,
      useFactory: (sandbox: HundredMsSandboxRoomProvider): RoomProvider =>
        agora ? new AgoraRoomProvider(agora) : sandbox,
      inject: [HundredMsSandboxRoomProvider],
    },
    {
      provide: RECORDING_PROVIDER,
      useFactory: (): RecordingProvider =>
        agora ? new AgoraCloudRecordingProvider(agora) : new SandboxRecordingProvider(),
    },
  ],
  exports: [SessionViewService, SessionService, AvailabilityService, SessionRoomService, SessionExtensionService, TranscriptService],
})
export class SessionsModule {}
