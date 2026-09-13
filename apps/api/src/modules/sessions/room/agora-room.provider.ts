import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { AgoraConfig } from './agora.config';
import { mediaUidFor } from './media-uid';
import {
  CreateRoomInput,
  CreateRoomResult,
  IssueJoinInput,
  JoinCredentials,
  RoomProvider,
} from './room-provider.interface';

/**
 * Agora rooms.
 *
 * An Agora "channel" exists the moment someone joins it with a valid
 * token, so creating a room makes no network call: it names the channel.
 * What actually gates entry is the token, which is signed here with the
 * app certificate and bound to one channel and one uid — a token for one
 * session cannot open another, and a user cannot join as someone else.
 */
export class AgoraRoomProvider implements RoomProvider {
  readonly code = 'agora';

  constructor(private readonly config: AgoraConfig) {}

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    return { roomProvider: this.code, roomReference: channelNameFor(input.sessionId) };
  }

  issueJoin(input: IssueJoinInput): JoinCredentials {
    const uid = mediaUidFor(input.userId);
    const token = RtcTokenBuilder.buildTokenWithUid(
      this.config.appId,
      this.config.appCertificate,
      input.roomReference,
      uid,
      RtcRole.PUBLISHER,
      input.expiresInSeconds,
      input.expiresInSeconds,
    );
    return {
      provider: this.code,
      roomReference: input.roomReference,
      appId: this.config.appId,
      token,
      uid,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    };
  }

  async closeRoom(): Promise<void> {
    // A channel closes itself when the last participant leaves. Tokens
    // expire on their own; nothing here needs revoking.
  }
}

/** Agora channel names are at most 64 bytes of a restricted set; a UUID with a prefix fits. */
export function channelNameFor(sessionId: string): string {
  return `sankalp-${sessionId}`;
}
