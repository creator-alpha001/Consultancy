import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native';
import { Body, Button, Card, ErrorNote, Field, H1, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { LIGHT as C, space, type } from '@/theme/tokens';

/**
 * Setting up a second factor, on the phone.
 *
 * 2FA is mandatory for providers and admins (#32), and until this screen
 * existed the mobile app could only tell a mentor to go and use the web
 * app instead. On the client the product is meant to be led by, that
 * made the entire supply side unreachable: a mentor could not onboard at
 * all.
 *
 * It runs on the enrolment ticket the login issued, not a session — a
 * provider who has never enrolled cannot log in, and enrolling requires
 * being logged in. The ticket's scope is enforced by the API's guard, so
 * nothing here has to be careful about what else it might permit.
 */
export default function MfaEnrol(): JSX.Element {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const begin = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const res = await api<{ secret: string; provisioningUri: string }>('/auth/mfa/enrol', {
        method: 'POST',
        enrolment: true,
      });
      setSecret(res.secret);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not start setup. Sign in again to retry.' },
      );
    }
  }, []);

  useEffect(() => {
    void begin();
  }, [begin]);

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      // The API returns `{ codes }`. Reading `recoveryCodes` here gave
      // undefined, so a confirm that had genuinely succeeded — 201, the
      // factor stored — silently left the user on the form with no error
      // and no way forward. Same shape of mistake as a client type that
      // does not match the response it describes.
      const res = await api<{ codes: string[] }>('/auth/mfa/confirm', {
        method: 'POST',
        enrolment: true,
        body: { code },
      });
      // Enrolment succeeded whatever came back; an empty list must still
      // move the user on rather than stranding them on a working form.
      setRecovery(res.codes ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'That did not work. Try the current code.' },
      );
    } finally {
      setBusy(false);
    }
  }

  // Shown once, and never again — so they are shown on their own screen,
  // with nothing else competing for attention and no way to walk past
  // them by accident.
  if (recovery) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Save these', headerBackVisible: false }} />
        <H1>Save these codes</H1>
        <Body muted>
          Each one signs you in once if you lose your phone. This is the only time they are shown.
        </Body>
        <View style={{ height: space.xl }} />
        <Card>
          {recovery.length === 0 ? (
            <Small>No codes were returned. Two-factor is set up — ask support for recovery codes.</Small>
          ) : (
            recovery.map((c) => (
              <Text key={c} style={[type.bodyStrong, { color: C.ink, letterSpacing: 1 }]}>
                {c}
              </Text>
            ))
          )}
        </Card>
        <View style={{ height: space.lg }} />
        <Button
          label={copied ? 'Copied' : 'Copy them'}
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(recovery.join('\n'));
            setCopied(true);
          }}
        />
        <View style={{ height: space.md }} />
        <Button label="Done — sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Two-factor setup' }} />
      <H1>Set up two-factor</H1>
      <Body muted>
        Accounts that can be paid, or that can act on other people&rsquo;s money, need a second factor.
      </Body>
      <View style={{ height: space.xl }} />

      <ErrorNote error={error} />

      <Section title="1. Add this key to an authenticator app">
        <Card>
          {secret ? (
            <>
              <Text selectable style={[type.bodyStrong, { color: C.ink, letterSpacing: 1 }]}>
                {secret}
              </Text>
              <Small>Any TOTP app works — the standard six-digit, 30-second kind.</Small>
              <View style={{ height: space.sm }} />
              <Row gap={space.sm}>
                <Button
                  label={copied ? 'Copied' : 'Copy the key'}
                  variant="secondary"
                  full={false}
                  onPress={async () => {
                    await Clipboard.setStringAsync(secret);
                    setCopied(true);
                  }}
                />
              </Row>
            </>
          ) : (
            <Small>Fetching your key…</Small>
          )}
        </Card>
      </Section>

      <Section title="2. Enter the code it shows">
        <Field
          label="Six-digit code"
          value={code}
          onChangeText={setCode}
          keyboard="number-pad"
          placeholder="123456"
        />
        <Button
          label="Confirm"
          onPress={confirm}
          busy={busy}
          disabled={!secret || code.trim().length < 6}
        />
      </Section>
    </Screen>
  );
}
