import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Chip, ErrorNote, Field, H1, Row, Screen, Small } from '@/components/kit';
import { ApiError } from '@/lib/api';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, TOUCH, radius, space, type } from '@/theme/tokens';

export default function Register(): JSX.Element {
  const router = useRouter();
  const { register, signIn } = useStore();
  const words = useWords();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'seeker' | 'provider'>('seeker');
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true); setError(null);
    try {
      await register(email, password, role);
      if (role === 'seeker') {
        await signIn(email, password);
        router.replace('/');
      } else {
        // #32: a provider needs a second factor before a session exists.
        setError({
          code: 'MFA_ENROLMENT_REQUIRED',
          message: 'Account created. Set up two-factor in the web app, then sign in here.',
        });
      }
    } catch (err) {
      setError(err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: 'UNKNOWN', message: 'Could not create the account.' });
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <H1>Create an account</H1>
      <View style={{ height: space.xl }} />
      <ErrorNote error={error} />

      <Text style={[type.smallStrong, { color: C.inkMuted, marginBottom: space.sm }]}>I am here to</Text>
      <Row gap={space.sm} wrap>
        <Chip label={`Get help`} selected={role === 'seeker'} onPress={() => setRole('seeker')} />
        <Chip label={`Give help`} selected={role === 'provider'} onPress={() => setRole('provider')} />
      </Row>
      <View style={{ height: space.xl }} />

      <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="At least 12 characters" />

      <Pressable
        onPress={() => setAdult(!adult)}
        style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: TOUCH, marginBottom: space.lg }}
      >
        <View style={{
          width: 24, height: 24, borderRadius: 7, marginTop: 2,
          backgroundColor: adult ? C.accent : 'transparent',
          borderWidth: adult ? 0 : 1, borderColor: C.rule,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {adult && <Text style={{ color: '#fff', fontSize: 13 }}>✓</Text>}
        </View>
        <Text style={[type.body, { color: C.ink, flex: 1 }]}>I am 18 or older.</Text>
      </Pressable>

      <Button label="Create account" busy={busy} disabled={!adult} onPress={() => void submit()} />
      <View style={{ height: space.lg }} />
      <Button label="I already have an account" variant="secondary" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
