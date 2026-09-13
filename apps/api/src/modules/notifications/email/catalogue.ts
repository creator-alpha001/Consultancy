/**
 * The words in every email the platform sends, by language.
 *
 * An i18n catalogue, so the only place these strings live (CLAUDE.md:
 * user-facing text lives in catalogues and pack data, never inline in
 * core). Domain-neutral on purpose: an email about a password reset reads
 * the same whether the person came for an exam, a career question or a
 * tax problem.
 *
 * Copy rules that apply here as everywhere: no urgency, no guarantees,
 * and a plain statement of what to do if the email was not expected.
 * A language with no entry falls back to English, never to nothing.
 */
export type EmailKey = 'password_reset' | 'email_verification' | 'credential_verified' | 'credential_rejected';

interface Template {
  subject: string;
  /** `{name}`, `{link}` and `{note}` are replaced; nothing else is interpolated. */
  body: string;
}

const CATALOGUE: Record<string, Record<EmailKey, Template>> = {
  en: {
    password_reset: {
      subject: 'Reset your Sankalp password',
      body: [
        'Hello {name},',
        '',
        'Someone asked to reset the password for this account. If it was you, open this link within 30 minutes:',
        '',
        '{link}',
        '',
        'Resetting signs you out on every device.',
        '',
        'If you did not ask for this, ignore this email. Your password has not changed.',
      ].join('\n'),
    },
    email_verification: {
      subject: 'Confirm your email address for Sankalp',
      body: [
        'Hello {name},',
        '',
        'Please confirm this is your email address by opening this link within 48 hours:',
        '',
        '{link}',
        '',
        'If you did not create an account, ignore this email.',
      ].join('\n'),
    },
    credential_verified: {
      subject: 'Your credential has been verified',
      body: [
        'Hello {name},',
        '',
        'A reviewer has verified a credential you submitted. Your profile now shows it.',
        '',
        'Open your checklist to see what is left before people can book you:',
        '',
        '{link}',
      ].join('\n'),
    },
    credential_rejected: {
      subject: 'We could not verify your credential',
      body: [
        'Hello {name},',
        '',
        'A reviewer could not verify a credential you submitted.',
        '',
        'Their note: {note}',
        '',
        'You can submit it again with more detail, or submit a different one:',
        '',
        '{link}',
      ].join('\n'),
    },
  },
  hi: {
    password_reset: {
      subject: 'अपना संकल्प पासवर्ड रीसेट करें',
      body: [
        'नमस्ते {name},',
        '',
        'इस खाते का पासवर्ड रीसेट करने का अनुरोध किया गया है। अगर यह आपने किया है, तो 30 मिनट के भीतर यह लिंक खोलें:',
        '',
        '{link}',
        '',
        'रीसेट करने पर आप हर डिवाइस से साइन आउट हो जाएँगे।',
        '',
        'अगर आपने यह अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें। आपका पासवर्ड नहीं बदला है।',
      ].join('\n'),
    },
    email_verification: {
      subject: 'संकल्प के लिए अपना ईमेल पता पुष्टि करें',
      body: [
        'नमस्ते {name},',
        '',
        'कृपया 48 घंटे के भीतर यह लिंक खोलकर पुष्टि करें कि यह आपका ईमेल पता है:',
        '',
        '{link}',
        '',
        'अगर आपने खाता नहीं बनाया, तो इस ईमेल को अनदेखा करें।',
      ].join('\n'),
    },
    credential_verified: {
      subject: 'आपका प्रमाण सत्यापित हो गया है',
      body: [
        'नमस्ते {name},',
        '',
        'समीक्षक ने आपका जमा किया गया प्रमाण सत्यापित कर दिया है। आपकी प्रोफ़ाइल पर अब यह दिखता है।',
        '',
        'लोग आपको बुक कर सकें, इससे पहले क्या बाकी है, यह देखने के लिए अपनी सूची खोलें:',
        '',
        '{link}',
      ].join('\n'),
    },
    credential_rejected: {
      subject: 'हम आपका प्रमाण सत्यापित नहीं कर सके',
      body: [
        'नमस्ते {name},',
        '',
        'समीक्षक आपका जमा किया गया प्रमाण सत्यापित नहीं कर सके।',
        '',
        'उनकी टिप्पणी: {note}',
        '',
        'आप अधिक जानकारी के साथ इसे फिर से जमा कर सकते हैं, या कोई दूसरा प्रमाण जमा कर सकते हैं:',
        '',
        '{link}',
      ].join('\n'),
    },
  },
};

export function renderEmail(
  key: EmailKey,
  lang: string,
  values: { name: string; link: string; note?: string },
): { subject: string; text: string } {
  const base = lang.split('-')[0];
  const template = (CATALOGUE[lang] ?? CATALOGUE[base] ?? CATALOGUE.en)[key];
  // Replaced once each, from a fixed set, so a name containing "{link}"
  // cannot smuggle a second link into the message.
  const text = template.body.replace(/\{(name|link|note)\}/g, (_, k: 'name' | 'link' | 'note') => values[k] ?? '');
  return { subject: template.subject, text };
}

/** Where emailed links point. The web app hosts every landing page. */
export function publicWebUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PUBLIC_WEB_URL ?? env.WEB_ORIGIN?.split(',')[0];
  return (configured ?? 'http://localhost:3001').replace(/\/+$/, '');
}
