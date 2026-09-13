import { Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Carries a single-use link. A transport must never log the body when this is set. */
  sensitive: boolean;
}

export interface EmailTransport {
  readonly code: string;
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export const EMAIL_TRANSPORT = 'EMAIL_TRANSPORT';

/**
 * The development transport: nothing is sent, everything is logged.
 *
 * Outside production the body is logged too, so someone running the app
 * locally can click a reset or verification link from the terminal. In
 * production the body is NEVER logged — it contains a working key to an
 * account — only who and what.
 *
 * `sent` keeps the last messages in memory so tests can read a link.
 */
export class LoggingEmailTransport implements EmailTransport {
  readonly code = 'log';
  readonly sent: EmailMessage[] = [];
  private readonly log = new Logger('Email');

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    this.sent.push(message);
    if (this.sent.length > 50) this.sent.shift();
    const production = process.env.NODE_ENV === 'production';
    const body = production && message.sensitive ? '[body withheld: contains a single-use link]' : message.text;
    this.log.log(`to=${message.to} subject="${message.subject}"\n${body}`);
    return { messageId: `log-${Date.now()}-${this.sent.length}` };
  }
}

/**
 * Amazon SES (v2), in Mumbai by default.
 *
 * Credentials come from the standard AWS provider chain (environment,
 * shared config, or an instance role) — never from this repository. The
 * sending identity (`EMAIL_FROM`'s domain) must be verified in SES, and
 * the account moved out of the SES sandbox, before mail reaches anyone
 * who is not also verified.
 */
export class SesEmailTransport implements EmailTransport {
  readonly code = 'ses';
  private readonly client: SESv2Client;

  constructor(
    private readonly from: string,
    region: string,
    client?: SESv2Client,
  ) {
    this.client = client ?? new SESv2Client({ region });
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const res = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
          },
        },
      }),
    );
    return { messageId: res.MessageId ?? 'ses-unknown' };
  }
}

/** `EMAIL_TRANSPORT=ses` selects SES and requires `EMAIL_FROM`. Anything else logs. */
export function emailTransportFromEnv(env: NodeJS.ProcessEnv = process.env): EmailTransport {
  if (env.EMAIL_TRANSPORT === 'ses') {
    if (!env.EMAIL_FROM) throw new Error('EMAIL_TRANSPORT=ses but EMAIL_FROM is not set');
    return new SesEmailTransport(env.EMAIL_FROM, env.SES_REGION ?? 'ap-south-1');
  }
  return new LoggingEmailTransport();
}
