import { SessionMode } from '../types';

/**
 * CLAUDE.md — "managed SFU (100ms / LiveKit / Agora) for video — do not
 * build SFU infrastructure." This is the seam. `AgoraRoomProvider` is the
 * real implementation; `HundredMsSandboxRoomProvider` stands in when no
 * vendor credentials are configured (local dev, tests), matching the
 * payment-aggregator pattern in money/pa/.
 */
export interface CreateRoomInput {
  sessionId: string;
  mode: SessionMode;
}

export interface CreateRoomResult {
  roomProvider: string;
  roomReference: string;
}

export interface IssueJoinInput {
  roomReference: string;
  /** The authenticated actor. Never a client-supplied id (CLAUDE.md #28). */
  userId: string;
  expiresInSeconds: number;
}

/**
 * What a client needs to join a room, and nothing vendor-specific in its
 * SHAPE: a client switches implementation on `provider`, and reads the
 * rest as opaque. `token` and `appId` are null for the sandbox, which
 * connects to nothing.
 */
export interface JoinCredentials {
  provider: string;
  roomReference: string;
  appId: string | null;
  token: string | null;
  /** The numeric media identity this user joins as, where the vendor uses one. */
  uid: number | null;
  expiresAt: string;
}

export interface RoomProvider {
  readonly code: string;
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  issueJoin(input: IssueJoinInput): JoinCredentials;
  closeRoom(roomReference: string): Promise<void>;
}

export const ROOM_PROVIDER = 'ROOM_PROVIDER';
