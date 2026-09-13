import {
  RecordingProvider,
  StartRecordingInput,
  StartedRecording,
  StopRecordingResult,
} from './recording-provider.interface';

/**
 * Paired with the sandbox room: records nothing, and says so in its code
 * and its reference. It exists so the consent gate and the run bookkeeping
 * are exercised in dev and tests; production cannot select it while a
 * real room vendor is configured (see `agoraConfigFromEnv`).
 */
export class SandboxRecordingProvider implements RecordingProvider {
  readonly code = 'sandbox';

  async start(input: StartRecordingInput): Promise<StartedRecording> {
    return { provider: this.code, reference: { sandbox: input.sessionId }, storagePrefix: null };
  }

  async stop(): Promise<StopRecordingResult> {
    return { files: [], note: 'sandbox: nothing was recorded' };
  }
}
