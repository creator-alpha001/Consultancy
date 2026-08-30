import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, ErrorNote, Field, H1, Screen, Small } from '@/components/kit';
import { ApiError } from '@/lib/api';
import { useStore } from '@/lib/store';
import { space } from '@/theme/tokens';

export default function SignIn(): JSX.Element {
  const router = useRouter();
  const { signIn } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true); setError(null);
    try {
      const r = await signIn(email, password, totp);
      if (r.mfaEnrolment) {
        // Used to be a dead end telling mentors to go and use the web
        // app — which made the entire provider side unreachable on the
        // client this product is led by.
        router.replace('/mfa-enrol');
        return;
      }
      router.back();
    } catch (err) {
      if (err instanceof ApiError) {
        // The API asks for a code rather than failing outright.
        if (err.code.includes('TOTP') || err.code.includes('MFA')) setNeedsTotp(true);
        setError({ code: err.code, message: err.message });
      } else {
        setError({ code: 'UNKNOWN', message: 'Could not sign in. Try again.' });
      }
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <H1>Welcome back</H1>
      <View style={{ height: space.xl }} />
      <ErrorNote error={error} />

      <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="Your password" />
      {needsTotp && (
        <Field label="Six-digit code" value={totp} onChangeText={setTotp} keyboard="number-pad" placeholder="123456" />
      )}

      <Button label="Sign in" busy={busy} onPress={() => void submit()} />
      <View style={{ height: space.lg }} />
      <Button label="Create an account instead" variant="secondary" onPress={() => router.replace('/register')} />
    </Screen>
  );
}
