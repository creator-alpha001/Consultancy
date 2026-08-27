import { SessionMode } from '../types';

/**
 * CLAUDE.md — "managed SFU (100ms / LiveKit / Agora) for video — do not
 * build SFU infrastructure." This is the seam; the sandbox
 * implementation here has no live credentials in this environment,
 * matching the M1 payment-aggregator pattern exactly (see
 * money/pa/payment-aggregator.interface.ts). Swapping in a real vendor
 * SDK is a new class behind this same interface.
 */
export interface CreateRoomInput {
  sessionId: string;
  mode: SessionMode;
}

export interface CreateRoomResult {
  roomProvider: string;
  roomReference: string;
}

export interface RoomProvider {
  readonly code: string;
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  closeRoom(roomReference: string): Promise<void>;
}

export const ROOM_PROVIDER = 'ROOM_PROVIDER';
