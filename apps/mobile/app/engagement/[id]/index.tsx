import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, ErrorNote, H1, Loading, Row, Screen, Section, Small, Stepper } from '@/components/kit';
import { ApiError, api, durationLabel, rupees, when } from '@/lib/api';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, space, type } from '@/theme/tokens';

interface Engagement {
  id: string; seekerId: string; providerId: string | null;
  engagementType: string | null; status: string; amountPaise: string | null;
}
interface Agenda {
  id: string; version: number; lockedAt: string | null; contentHash: string | null;
  items: Array<{ id: string; labelText: string; checkedAt: string | null }>;
}
interface SessionRow {
  id: string; engagement_id: string; scheduled_start: string; scheduled_end: string; status: string;
}

export default function EngagementDetail(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me } = useStore();
  const words = useWords();
  const [e, setE] = useState<Engagement | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [eng, ag, ss] = await Promise.all([
      api<Engagement>(`/engagements/${id}`).catch(() => null),
      api<Agenda | null>(`/engagements/${id}/agenda`).catch(() => null),
      api<SessionRow[]>('/sessions').catch(() => []),
    ]);
    setE(eng);
    setAgenda(ag);
    setSessions(ss.filter((s) => s.engagement_id === id));
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function act(path: string, idempotencyKey?: string): Promise<void> {
    setBusy(true); setError(null);
    try {
      await api(path, { method: 'POST', idempotencyKey });
      await load();
    } catch (err) {
      setError(err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: 'UNKNOWN', message: 'Something went wrong.' });
    } finally { setBusy(false); }
  }

  if (!e) return <Screen><Loading /></Screen>;

  const isSeeker = e.seekerId === me?.id;
  const unticked = agenda ? agenda.items.filter((i) => !i.checkedAt).length : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: (e.engagementType ?? '').replace(/_/g, ' ') }} />
      <ErrorNote error={error} />

      <Card>
        <Row between align="flex-start">
          <View style={{ gap: 2 }}>
            <Small>{isSeeker ? `With your ${words.provider.toLowerCase()}` : `With your ${words.seeker.toLowerCase()}`}</Small>
            <Text style={[type.display, { color: C.ink }]}>{rupees(e.amountPaise)}</Text>
          </View>
          <Chip label={e.status.replace(/_/g, ' ')} tone={e.status === 'completed' ? 'good' : 'neutral'} />
        </Row>
        <View style={{ height: space.sm }} />
        <Stepper status={e.status} />
      </Card>

      <View style={{ height: space.xl }} />

      <Section
        title="Agenda"
        action={<Chip label={agenda ? (agenda.lockedAt ? 'Locked' : 'Draft') : 'Not written'} tone={agenda?.lockedAt ? 'accent' : 'neutral'} />}
      >
        {agenda ? (
          <Card onPress={() => router.push(`/engagement/${id}/agenda`)}>
            <View style={{ gap: space.sm }}>
              {agenda.items.map((item, i) => (
                <Row key={item.id} gap={space.sm} align="flex-start">
                  <View style={{
                    width: 20, height: 20, borderRadius: 6, marginTop: 1,
                    backgroundColor: item.checkedAt ? C.good : 'transparent',
                    borderWidth: item.checkedAt ? 0 : 1, borderColor: C.rule,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 11, color: item.checkedAt ? '#fff' : C.inkFaint }}>
                      {item.checkedAt ? '✓' : String(i + 1)}
                    </Text>
                  </View>
                  <Text style={[type.body, { color: item.checkedAt ? C.inkMuted : C.ink, flex: 1 }]}>
                    {item.labelText}
                  </Text>
                </Row>
              ))}
            </View>
          </Card>
        ) : (
          <Empty
            text="Nothing agreed yet. Work cannot start until you both agree the goals."
            action={<Button label="Write the agenda" onPress={() => router.push(`/engagement/${id}/agenda`)} />}
          />
        )}
      </Section>

      {sessions.length > 0 && (
        <Section title="Sessions">
          <View style={{ gap: space.md }}>
            {sessions.map((s) => (
              <Card key={s.id} onPress={() => router.push(`/session/${s.id}`)}>
                <Row between>
                  <View style={{ gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: C.ink }]}>{when(s.scheduled_start)}</Text>
                    <Small>{durationLabel(s.scheduled_start, s.scheduled_end)}</Small>
                  </View>
                  <Chip label={s.status === 'in_progress' ? 'Join' : 'Open'} tone="accent" />
                </Row>
              </Card>
            ))}
          </View>
        </Section>
      )}

      <Section title="What happens next">
        {e.status === 'draft' && (
          <Card>
            <Body>Both of you confirm the terms, then the agenda can be locked.</Body>
            <View style={{ height: space.sm }} />
            <Button label="Agree to these terms" busy={busy} onPress={() => void act(`/engagements/${id}/agree`)} />
          </Card>
        )}

        {e.status === 'agreed' && (
          <Card>
            <Body>Terms agreed. Lock the agenda and fund escrow to start.</Body>
            <View style={{ height: space.sm }} />
            <Button label="Open the agenda" variant="secondary" onPress={() => router.push(`/engagement/${id}/agenda`)} />
          </Card>
        )}

        {e.status === 'assessed' && isSeeker && (
          <Card>
            {unticked > 0 && (
              <View style={{ marginBottom: space.sm }}>
                <Text style={[type.smallStrong, { color: C.correction }]}>
                  {unticked} goal{unticked === 1 ? '' : 's'} never ticked.
                </Text>
              </View>
            )}
            <Button
              label={`Accept and release ${rupees(e.amountPaise)}`}
              busy={busy}
              onPress={() => void act(`/engagements/${id}/complete`, `complete:${id}`)}
            />
          </Card>
        )}

        {e.status === 'completed' && (
          <Card>
            <Body>Done. The money has been released.</Body>
            <View style={{ height: space.sm }} />
            <Button
              label="Leave a review"
              variant="secondary"
              onPress={() => router.push(`/engagement/${id}/review`)}
            />
          </Card>
        )}

        {e.status === 'disputed' && (
          <Card tone="alert">
            <Text style={[type.bodyStrong, { color: C.correction }]}>Disputed</Text>
            <Small>The money is frozen while this is looked at. Nobody can draw it.</Small>
          </Card>
        )}
      </Section>
    </Screen>
  );
}
