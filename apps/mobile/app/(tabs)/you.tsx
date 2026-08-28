import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Chip, H1, Row, Screen, Section, Small } from '@/components/kit';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, space, type } from '@/theme/tokens';

export default function You(): JSX.Element {
  const router = useRouter();
  const { me, domain, lang, setLang, signOut } = useStore();
  const words = useWords();

  if (!me) {
    return (
      <Screen>
        <H1>You</H1>
        <Body muted>Sign in to book, agree goals, and track your work.</Body>
        <View style={{ marginTop: space.xl, gap: space.md }}>
          <Button label="Create an account" onPress={() => router.push('/register')} />
          <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>You</H1>

      <Card>
        <Row gap={space.md}>
          <Avatar name={me.email} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.bodyStrong, { color: C.ink }]}>{me.email}</Text>
            <Small>{me.role === 'provider' ? words.provider : words.seeker}</Small>
          </View>
        </Row>
      </Card>

      <View style={{ height: space.xl }} />

      <Section title="Language">
        <Row gap={space.sm} wrap>
          {(domain?.languages ?? ['en']).map((l) => (
            <Chip key={l} label={l} selected={l === lang} onPress={() => setLang(l)} />
          ))}
        </Row>
        <View style={{ height: space.sm }} />
        <Small>Everything in the app follows this, including what your {words.provider.toLowerCase()} sees.</Small>
      </Section>

      {domain?.supportResources && domain.supportResources.length > 0 && (
        <Section title="If you need to talk to someone">
          <View style={{ gap: space.sm }}>
            {domain.supportResources.map((r) => (
              <Card key={r.value}>
                <Text style={[type.bodyStrong, { color: C.ink }]}>{r.value}</Text>
                <Small>{r.label}</Small>
              </Card>
            ))}
          </View>
        </Section>
      )}

      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
