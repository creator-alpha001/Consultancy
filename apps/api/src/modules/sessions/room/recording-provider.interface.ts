/**
 * The cloud-recording seam.
 *
 * Recording runs on the vendor's servers, not on anyone's phone, so a
 * dropped handset cannot lose the evidence. It is started only by the
 * API and only after both parties have consented (CLAUDE.md #21) — no
 * client can start a recorder directly.
 *
 * Audio only, by product decision: an audio recording plus the locked
 * agenda and the chat log is the evidence a dispute reads. Composite
 * video recording costs several times more per minute and is not needed
 * for that.
 */
export interface StartRecordingInput {
  sessionId: string;
  roomReference: string;
}

export interface StartedRecording {
  provider: string;
  /** Whatever the vendor needs to stop this run later. Opaque to core. */
  reference: Record<string, string>;
  storagePrefix: string | null;
}

export interface StopRecordingResult {
  /** The vendor's report of what it wrote. Opaque to core. */
  files: unknown;
  /** Set when the vendor had already stopped on its own (e.g. idle timeout). */
  note: string | null;
}

export interface RecordingProvider {
  readonly code: string;
  start(input: StartRecordingInput): Promise<StartedRecording>;
  stop(input: { roomReference: string; reference: Record<string, string> }): Promise<StopRecordingResult>;
}

export const RECORDING_PROVIDER = 'RECORDING_PROVIDER';

/** Thrown when a vendor call fails. Carries no secrets. */
export class RecordingVendorError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
  }
}
