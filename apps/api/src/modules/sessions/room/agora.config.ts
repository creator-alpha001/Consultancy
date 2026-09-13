/**
 * Agora configuration, read once at boot.
 *
 * `ROOM_PROVIDER=agora` selects the vendor. When it is set, EVERY value
 * below must be present or the API refuses to start: a production build
 * that silently fell back to the sandbox would tell both parties a
 * recording was running when nothing was being recorded — a false record
 * of evidence, which is worse than no recording at all.
 *
 * The storage keys belong to a dedicated IAM user that can only write
 * under the recordings prefix of a private bucket in ap-south-1
 * (CLAUDE.md stack table). Agora writes files there directly; they never
 * pass through this API.
 */
export interface AgoraConfig {
  appId: string;
  appCertificate: string;
  /** RESTful API credentials — distinct from the app certificate. */
  customerKey: string;
  customerSecret: string;
  apiBase: string;
  storage: {
    bucket: string;
    accessKey: string;
    secretKey: string;
    /** Agora's integer code for the S3 region. 14 is AP_SOUTH_1 (Mumbai). */
    regionCode: number;
  };
}

const REQUIRED = [
  'AGORA_APP_ID',
  'AGORA_APP_CERTIFICATE',
  'AGORA_CUSTOMER_KEY',
  'AGORA_CUSTOMER_SECRET',
  'RECORDING_S3_BUCKET',
  'RECORDING_S3_ACCESS_KEY',
  'RECORDING_S3_SECRET_KEY',
] as const;

/** Returns null when Agora is not the selected provider. Throws when it is, but is misconfigured. */
export function agoraConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AgoraConfig | null {
  if (env.ROOM_PROVIDER !== 'agora') return null;

  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`ROOM_PROVIDER=agora but these are not set: ${missing.join(', ')}`);
  }

  const regionCode = env.RECORDING_S3_REGION_CODE === undefined ? 14 : Number(env.RECORDING_S3_REGION_CODE);
  if (!Number.isInteger(regionCode) || regionCode < 0) {
    throw new Error('RECORDING_S3_REGION_CODE must be a non-negative integer');
  }

  return {
    appId: env.AGORA_APP_ID as string,
    appCertificate: env.AGORA_APP_CERTIFICATE as string,
    customerKey: env.AGORA_CUSTOMER_KEY as string,
    customerSecret: env.AGORA_CUSTOMER_SECRET as string,
    apiBase: env.AGORA_API_BASE ?? 'https://api.agora.io',
    storage: {
      bucket: env.RECORDING_S3_BUCKET as string,
      accessKey: env.RECORDING_S3_ACCESS_KEY as string,
      secretKey: env.RECORDING_S3_SECRET_KEY as string,
      regionCode,
    },
  };
}
