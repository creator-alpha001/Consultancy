import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { api, durationLabel, when } from '@/lib/api';
import { useStore } from '@/lib/store';
import { LIGHT as C, space, type } from '@/theme/tokens';

interface SessionRow {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  mode: string;
}

export default function Sessions(): JSX.Element {
  const router = useRouter();
  const { me } = useStore();
  const [rows, setRows] = useState<SessionRow[] | null>(null);

  useEffect(() => {
    if (!me) { setRows([]); return; }
    void (async () => setRows(await api<SessionRow[]>('/sessions').catch(() => [])))();
  }, [me]);

  if (!me) {
    return (
      <Screen>
        <H1>Sessions</H1>
        <Body muted>Sign in to see your booked sessions.</Body>
        <View style={{ marginTop: space.xl }}>
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
      </Screen>
    );
  }

  const now = Date.now();
  const upcoming = (rows ?? []).filter((r) => new Date(r.scheduled_end).getTime() >= now && r.status !== 'cancelled');
  const past = (rows ?? []).filter((r) => new Date(r.scheduled_end).getTime() < now || r.status === 'cancelled');

  const row = (r: SessionRow) => (
    <Card key={r.id} onPress={() => router.push(`/session/${r.id}`)}>
      <Row between align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: C.ink }]}>{when(r.scheduled_start)}</Text>
          <Small>
            {durationLabel(r.scheduled_start, r.scheduled_end)} · {r.mode.replace(/_/g, ' ')}
          </Small>
        </View>
        <Chip
          label={r.status.replace(/_/g, ' ')}
          tone={r.status === 'in_progress' ? 'good' : r.status === 'cancelled' ? 'alert' : 'neutral'}
        />
      </Row>
    </Card>
  );

  return (
    <Screen>
      <H1>Sessions</H1>
      {rows === null ? (
        <Loading />
      ) : (
        <>
          <Section title="Upcoming">
            {upcoming.length === 0 ? (
              <Empty
                text="Nothing booked."
                action={<Button label="Find someone" onPress={() => router.push('/find')} />}
              />
            ) : (
              <View style={{ gap: space.md }}>{upcoming.map(row)}</View>
            )}
          </Section>
          {past.length > 0 && (
            <Section title="Past">
              <View style={{ gap: space.md }}>{past.map(row)}</View>
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}
