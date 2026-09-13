import { Injectable } from '@nestjs/common';
import {
  CreateRoomInput,
  CreateRoomResult,
  IssueJoinInput,
  JoinCredentials,
  RoomProvider,
} from './room-provider.interface';

/**
 * Sandbox stand-in for a managed SFU, used when no vendor is configured
 * (see `roomProviderFactory`). No network call, no real room,
 * deterministic. It issues no token, and a client seeing this provider
 * code joins its fake room client — so nothing downstream pretends media
 * is flowing. The code value is kept as-is because it is stored on
 * existing session rows.
 */
@Injectable()
export class HundredMsSandboxRoomProvider implements RoomProvider {
  readonly code = '100ms_sandbox';

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    return { roomProvider: this.code, roomReference: `sandbox_room_${input.sessionId}` };
  }

  issueJoin(input: IssueJoinInput): JoinCredentials {
    return {
      provider: this.code,
      roomReference: input.roomReference,
      appId: null,
      token: null,
      uid: null,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    };
  }

  async closeRoom(): Promise<void> {
    // no-op — nothing real to close
  }
}
