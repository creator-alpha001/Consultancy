import { Injectable } from '@nestjs/common';
import { CreateRoomInput, CreateRoomResult, RoomProvider } from './room-provider.interface';

/**
 * Sandbox stand-in for a managed SFU (100ms, in this name — LiveKit or
 * Agora are equally valid real choices behind the same interface). No
 * network call, no real room, deterministic — this environment has no
 * live SFU credentials. What it does NOT simulate: adaptive bitrate,
 * network-quality signalling, reconnection — those are real client+SFU
 * behaviour with nothing meaningful to fake at this layer. See
 * TRACKER.md.
 */
@Injectable()
export class HundredMsSandboxRoomProvider implements RoomProvider {
  readonly code = '100ms_sandbox';

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    return { roomProvider: this.code, roomReference: `sandbox_room_${input.sessionId}` };
  }

  async closeRoom(): Promise<void> {
    // no-op — nothing real to close
  }
}
