import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CheckList, Chip, Empty, H1, Loading, Row, Screen, Section, Small, Stepper } from '@/components/kit';
import { api, durationLabel, rupees, when } from '@/lib/api';
import { pluralWord } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, space, type } from '@/theme/tokens';
import { Text } from 'react-native';

interface Engagement {
  id: string;
  engagementType: string | null;
  status: string;
  amountPaise: string | null;
  domainCode: string | null;
}
interface SessionRow {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

const ACTIVE = ['draft', 'agreed', 'working', 'delivered', 'assessed', 'disputed'];

/**
 * Home.
 *
 * Answers one question — *what needs me now* — before anything else. A
 * dashboard that opens on statistics makes a person hunt for their own
 * task; this opens on the task.
 */
export default function Home(): JSX.Element {
  const router = useRouter();
  const { me, ready, domain } = useStore();
  const words = useWords();
  const [engagements, setEngagements] = useState<Engagement[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useEffect(() => {
    if (!me) {
      setEngagements([]);
      return;
    }
    void (async () => {
      const [e, s] = await Promise.all([
        api<Engagement[]>('/engagements').catch(() => []),
        api<SessionRow[]>('/sessions').catch(() => []),
      ]);
      setEngagements(e);
      setSessions(s);
    })();
  }, [me]);

  if (!ready) return <Screen><Loading /></Screen>;

  if (!me) {
    return (
      <Screen>
        <View style={{ paddingTop: space.xl, marginBottom: space.xxl }}>
          <Small>{words.family}</Small>
          <View style={{ height: space.md }} />
          <H1>Guidance you can hold someone to.</H1>
          <Body muted>
            Agree what you need in writing. Your money waits in escrow until it is done.
          </Body>
        </View>

        <View style={{ gap: space.md, marginBottom: space.xl }}>
          <Button label="Create an account" onPress={() => router.push('/register')} />
          <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>

        <View style={{ marginBottom: space.xxl }}>
          <CheckList
            items={[
              'Free to join, no card required',
              `Verified ${pluralWord(words.provider.toLowerCase())}, matched on skill and language`,
              'Escrow released only when you accept the work',
            ]}
          />
        </View>

        <Section title="How it works">
          <View style={{ gap: space.md }}>
            {[
              ['Find someone verified', 'Matched on the skill your work needs, in your language.'],
              ['Agree the goals', 'Written down, including what is out of scope. Both of you sign off.'],
              ['Pay into escrow', 'Nothing is released until you accept the work.'],
              ['Get it done', 'By video, voice, or marked-up document.'],
            ].map(([title, sub], i) => (
              <Card key={title}>
                <Row gap={space.lg} align="flex-start">
                  <Text style={[type.title, { color: C.inkFaint, width: 28 }]}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: space.xs }}>
                    <Text style={[type.bodyStrong, { color: C.ink }]}>{title}</Text>
                    <Small>{sub}</Small>
                  </View>
                </Row>
              </Card>
            ))}
          </View>
        </Section>

        <Button
          label={`Browse verified ${pluralWord(words.provider.toLowerCase())}`}
          variant="secondary"
          onPress={() => router.push('/find')}
        />
      </Screen>
    );
  }

  const active = (engagements ?? []).filter((e) => ACTIVE.includes(e.status));
  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_end).getTime() >= Date.now() && s.status !== 'cancelled')
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  const next = upcoming[0];

  return (
    <Screen>
      <View style={{ paddingTop: space.sm, marginBottom: space.xl }}>
        <Small>{domain ? words.family : ''}</Small>
        <View style={{ height: space.sm }} />
        <H1>Namaste</H1>
      </View>

      {next && (
        <Section title="Next session">
          <Card onPress={() => router.push(`/session/${next.id}`)}>
            <Row between>
              <View style={{ gap: 2 }}>
                <Text style={[type.bodyStrong, { color: C.ink }]}>{when(next.scheduled_start)}</Text>
                <Small>{durationLabel(next.scheduled_start, next.scheduled_end)}</Small>
              </View>
              <Chip label="Join" tone="accent" />
            </Row>
          </Card>
        </Section>
      )}

      <Section
        title="In progress"
        action={active.length > 0 ? <Small>{active.length}</Small> : undefined}
      >
        {engagements === null ? (
          <Loading />
        ) : active.length === 0 ? (
          <Empty
            text="Nothing in progress."
            action={<Button label="Find someone to help" onPress={() => router.push('/find')} />}
          />
        ) : (
          <View style={{ gap: space.md }}>
            {active.map((e) => (
              <Card key={e.id} onPress={() => router.push(`/engagement/${e.id}`)}>
                <Row between align="flex-start">
                  <Text style={[type.bodyStrong, { color: C.ink, flex: 1 }]}>
                    {(e.engagementType ?? 'engagement').replace(/_/g, ' ')}
                  </Text>
                  <Text style={[type.bodyStrong, { color: C.ink }]}>{rupees(e.amountPaise)}</Text>
                </Row>
                <Stepper status={e.status} />
              </Card>
            ))}
          </View>
        )}
      </Section>

      <View style={{ gap: space.md }}>
        <Button
          label={`Find a ${words.provider.toLowerCase()}`}
          variant="secondary"
          onPress={() => router.push('/find')}
        />
        {/*
          The other half of the marketplace: for someone who does not
          already know who to ask, searching is the wrong starting point.
        */}
        <Button
          label="Post what you need instead"
          variant="secondary"
          onPress={() => router.push('/board')}
        />
      </View>
    </Screen>
  );
}
