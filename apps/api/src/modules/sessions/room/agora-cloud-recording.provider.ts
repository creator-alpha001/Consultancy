import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { AgoraConfig } from './agora.config';
import { RECORDER_MEDIA_UID } from './media-uid';
import {
  RecordingProvider,
  RecordingVendorError,
  StartRecordingInput,
  StartedRecording,
  StopRecordingResult,
} from './recording-provider.interface';

type Fetch = typeof fetch;

/** How long the recorder waits in an empty channel before exiting on its own. */
const MAX_IDLE_SECONDS = 120;
/** Upper bound on one run. Agora releases the resource after this regardless. */
const RESOURCE_EXPIRED_HOURS = 24;
/** A vendor call that hangs must not hang the request that made it. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Agora Cloud Recording, composite ("mix") mode, audio only.
 *
 * acquire → start → (stop). The recorder joins the channel as a silent
 * participant with its own uid and token, mixes both parties' audio, and
 * uploads HLS segments straight to our private S3 bucket under
 * `sessions/<sessionId>/`.
 *
 * Every call here is made OUTSIDE any database transaction (CLAUDE.md
 * #9); `SessionService` writes the run's row only after the vendor has
 * answered.
 */
export class AgoraCloudRecordingProvider implements RecordingProvider {
  readonly code = 'agora_cloud_recording';

  constructor(
    private readonly config: AgoraConfig,
    private readonly http: Fetch = fetch,
  ) {}

  async start(input: StartRecordingInput): Promise<StartedRecording> {
    const uid = String(RECORDER_MEDIA_UID);
    const cname = input.roomReference;

    const acquired = await this.call<{ resourceId?: string }>('acquire', {
      cname,
      uid,
      clientRequest: { resourceExpiredHour: RESOURCE_EXPIRED_HOURS, scene: 0 },
    });
    if (!acquired.resourceId) throw new RecordingVendorError('acquire returned no resourceId', null);

    const prefix = ['sessions', input.sessionId.replace(/-/g, '')];
    const token = RtcTokenBuilder.buildTokenWithUid(
      this.config.appId,
      this.config.appCertificate,
      cname,
      RECORDER_MEDIA_UID,
      RtcRole.PUBLISHER,
      RESOURCE_EXPIRED_HOURS * 3600,
      RESOURCE_EXPIRED_HOURS * 3600,
    );

    const started = await this.call<{ sid?: string }>(
      `resourceid/${encodeURIComponent(acquired.resourceId)}/mode/mix/start`,
      {
        cname,
        uid,
        clientRequest: {
          token,
          recordingConfig: {
            channelType: 0,
            // 0 = audio only. The evidence decision, in one number.
            streamTypes: 0,
            audioProfile: 0,
            maxIdleTime: MAX_IDLE_SECONDS,
          },
          recordingFileConfig: { avFileType: ['hls'] },
          storageConfig: {
            vendor: 1, // Amazon S3
            region: this.config.storage.regionCode,
            bucket: this.config.storage.bucket,
            accessKey: this.config.storage.accessKey,
            secretKey: this.config.storage.secretKey,
            fileNamePrefix: prefix,
          },
        },
      },
    );
    if (!started.sid) throw new RecordingVendorError('start returned no sid', null);

    return {
      provider: this.code,
      reference: { resourceId: acquired.resourceId, sid: started.sid, uid },
      storagePrefix: `s3://${this.config.storage.bucket}/${prefix.join('/')}/`,
    };
  }

  async stop(input: { roomReference: string; reference: Record<string, string> }): Promise<StopRecordingResult> {
    const { resourceId, sid, uid } = input.reference;
    if (!resourceId || !sid || !uid) {
      throw new RecordingVendorError('recording reference is incomplete', null);
    }
    try {
      const res = await this.call<{ serverResponse?: { fileList?: unknown } }>(
        `resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/mix/stop`,
        { cname: input.roomReference, uid, clientRequest: {} },
      );
      return { files: res.serverResponse?.fileList ?? null, note: null };
    } catch (err) {
      // 404: the recorder is no longer running — it exited on idle
      // timeout or resource expiry. That IS stopped; the run can close.
      if (err instanceof RecordingVendorError && err.httpStatus === 404) {
        return { files: null, note: 'recorder had already exited' };
      }
      throw err;
    }
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.apiBase}/v1/apps/${encodeURIComponent(this.config.appId)}/cloud_recording/${path}`;
    const auth = Buffer.from(`${this.config.customerKey}:${this.config.customerSecret}`).toString('base64');
    let res: Response;
    try {
      res = await this.http(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new RecordingVendorError(`recording vendor unreachable: ${(err as Error).name}`, null);
    }
    const text = await res.text();
    if (!res.ok) {
      // The body is logged by status only: it can echo the request, and
      // the request carries storage credentials.
      throw new RecordingVendorError(`recording vendor answered ${res.status}`, res.status);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new RecordingVendorError('recording vendor answered with a non-JSON body', res.status);
    }
  }
}
