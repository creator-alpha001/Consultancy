import { describe, expect, it } from 'vitest';
import { AgoraCloudRecordingProvider } from '../../src/modules/sessions/room/agora-cloud-recording.provider';
import { AgoraRoomProvider, channelNameFor } from '../../src/modules/sessions/room/agora-room.provider';
import { AgoraConfig, agoraConfigFromEnv } from '../../src/modules/sessions/room/agora.config';
import { mediaUidFor, RECORDER_MEDIA_UID } from '../../src/modules/sessions/room/media-uid';
import { RecordingVendorError } from '../../src/modules/sessions/room/recording-provider.interface';

/**
 * The Agora classes without Agora. No credentials exist in this
 * environment, so these prove what can be proven locally: the requests
 * sent are the requests documented, the failure modes are the ones the
 * session service relies on, and a token is issued per user and channel.
 * Whether Agora ACCEPTS them is only provable against a real project.
 */

const config: AgoraConfig = {
  appId: '0123456789abcdef0123456789abcdef',
  appCertificate: 'fedcba9876543210fedcba9876543210',
  customerKey: 'ck',
  customerSecret: 'cs',
  apiBase: 'https://agora.test',
  storage: { bucket: 'recordings', accessKey: 'ak', secretKey: 'sk', regionCode: 14 },
};

const SESSION = '5b1e2a4c-9d3f-4f6a-8b7c-1d2e3f4a5b6c';

function fakeHttp(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const http = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return { http, calls };
}

describe('agoraConfigFromEnv', () => {
  it('is null when another provider is selected', () => {
    expect(agoraConfigFromEnv({})).toBeNull();
  });

  it('refuses to boot with agora selected and any credential missing', () => {
    expect(() => agoraConfigFromEnv({ ROOM_PROVIDER: 'agora', AGORA_APP_ID: 'x' })).toThrow(
      /AGORA_APP_CERTIFICATE.*RECORDING_S3_SECRET_KEY/,
    );
  });

  it('defaults the storage region to Mumbai', () => {
    const c = agoraConfigFromEnv({
      ROOM_PROVIDER: 'agora',
      AGORA_APP_ID: 'a', AGORA_APP_CERTIFICATE: 'b', AGORA_CUSTOMER_KEY: 'c', AGORA_CUSTOMER_SECRET: 'd',
      RECORDING_S3_BUCKET: 'e', RECORDING_S3_ACCESS_KEY: 'f', RECORDING_S3_SECRET_KEY: 'g',
    });
    expect(c?.storage.regionCode).toBe(14);
  });
});

describe('mediaUidFor', () => {
  it('is stable for a user and stays clear of the recorder', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    for (const id of ids) {
      const uid = mediaUidFor(id);
      expect(uid).toBe(mediaUidFor(id));
      expect(uid).toBeGreaterThanOrEqual(1);
      expect(uid).toBeLessThan(RECORDER_MEDIA_UID);
    }
  });
});

describe('AgoraRoomProvider', () => {
  it('names the channel from the session and issues a token bound to the actor', async () => {
    const rooms = new AgoraRoomProvider(config);
    const room = await rooms.createRoom({ sessionId: SESSION, mode: 'video' });
    expect(room).toEqual({ roomProvider: 'agora', roomReference: channelNameFor(SESSION) });
    expect(Buffer.byteLength(room.roomReference)).toBeLessThan(64);

    const seeker = rooms.issueJoin({ roomReference: room.roomReference, userId: 'seeker', expiresInSeconds: 3600 });
    const provider = rooms.issueJoin({ roomReference: room.roomReference, userId: 'provider', expiresInSeconds: 3600 });
    expect(seeker.provider).toBe('agora');
    expect(seeker.appId).toBe(config.appId);
    expect(seeker.token).toMatch(/^007/); // AccessToken2
    expect(seeker.uid).toBe(mediaUidFor('seeker'));
    expect(seeker.token).not.toBe(provider.token);
  });
});

describe('AgoraCloudRecordingProvider', () => {
  it('acquires then starts an audio-only composite recording into our bucket', async () => {
    const { http, calls } = fakeHttp([
      { status: 200, body: { resourceId: 'res-1' } },
      { status: 200, body: { sid: 'sid-1', resourceId: 'res-1' } },
    ]);
    const recorder = new AgoraCloudRecordingProvider(config, http);
    const started = await recorder.start({ sessionId: SESSION, roomReference: channelNameFor(SESSION) });

    expect(calls.map((c) => c.url)).toEqual([
      `https://agora.test/v1/apps/${config.appId}/cloud_recording/acquire`,
      `https://agora.test/v1/apps/${config.appId}/cloud_recording/resourceid/res-1/mode/mix/start`,
    ]);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('ck:cs').toString('base64')}`);

    const body = JSON.parse(String(calls[1].init.body));
    expect(body.uid).toBe(String(RECORDER_MEDIA_UID));
    expect(body.clientRequest.recordingConfig.streamTypes).toBe(0); // audio only
    expect(body.clientRequest.storageConfig).toMatchObject({ vendor: 1, region: 14, bucket: 'recordings' });
    expect(body.clientRequest.storageConfig.fileNamePrefix).toEqual(['sessions', SESSION.replace(/-/g, '')]);

    expect(started.reference).toEqual({ resourceId: 'res-1', sid: 'sid-1', uid: String(RECORDER_MEDIA_UID) });
    expect(started.storagePrefix).toBe(`s3://recordings/sessions/${SESSION.replace(/-/g, '')}/`);
  });

  it('fails loudly when the vendor refuses, without echoing the request', async () => {
    const { http } = fakeHttp([{ status: 401, body: { reason: 'sk echoed here' } }]);
    const recorder = new AgoraCloudRecordingProvider(config, http);
    const err = await recorder.start({ sessionId: SESSION, roomReference: 'r' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RecordingVendorError);
    expect((err as Error).message).not.toContain('sk');
  });

  it('treats "recorder not found" on stop as already stopped', async () => {
    const { http } = fakeHttp([{ status: 404, body: { code: 404 } }]);
    const recorder = new AgoraCloudRecordingProvider(config, http);
    const res = await recorder.stop({ roomReference: 'r', reference: { resourceId: 'a', sid: 'b', uid: '1' } });
    expect(res.note).toMatch(/already exited/);
  });

  it('surfaces any other stop failure, so the flag is not cleared', async () => {
    const { http } = fakeHttp([{ status: 503, body: {} }]);
    const recorder = new AgoraCloudRecordingProvider(config, http);
    await expect(
      recorder.stop({ roomReference: 'r', reference: { resourceId: 'a', sid: 'b', uid: '1' } }),
    ).rejects.toBeInstanceOf(RecordingVendorError);
  });
});
