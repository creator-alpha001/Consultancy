import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, ErrorNote, H1, H3, Loading, Row, Screen, Section, Small, Stepper } from '@/components/kit';
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

  async function act(path: string, idempotencyKey?: string, body?: unknown): Promise<void> {
    setBusy(true); setError(null);
    try {
      await api(path, { method: 'POST', idempotencyKey, body });
      await load();
    } catch (err) {
      setError(err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: 'UNKNOWN', message: 'Something went wrong.' });
    } finally { setBusy(false); }
  }

  /**
   * Pay into escrow.
   *
   * The idempotency key is derived from the engagement, not generated
   * fresh — a double tap on a phone is far more likely than a
   * double-click, and both must reach the same key and therefore the same
   * single charge.
   */
  async function pay(): Promise<void> {
    await act(`/engagements/${id}/payment`, `engagement-payment:${id}`);
  }

  if (!e) return <Screen><Loading /></Screen>;

  const isSeeker = e.seekerId === me?.id;
  const isProvider = e.providerId === me?.id;
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

        {/*
          Paying, on the phone.
          This card used to say "lock the agenda and fund escrow to start"
          and offer no way to fund anything — the same dead end the web
          app had. A seeker who agreed terms here could not go further
          without opening a laptop, halfway through something they had
          started on a phone on a train.

          The amount is never sent: the API reads it from the engagement
          row, so there is nothing this screen could get wrong about what
          is charged.
        */}
        {e.status === 'agreed' && isSeeker && agenda?.lockedAt && (
          <Card>
            <H3>Pay into escrow</H3>
            <View style={{ height: space.sm }} />
            {[
              ['Amount', rupees(e.amountPaise)],
              ['Held by', 'A licensed payment aggregator'],
              ['Released when', 'You confirm the goals were met'],
            ].map(([term, value]) => (
              <View key={term} style={{ paddingVertical: space.xs }}>
                <Row between align="flex-start">
                  <Small>{term}</Small>
                  <Text style={[type.bodyStrong, { color: C.ink, flexShrink: 1, textAlign: 'right' }]}>
                    {value}
                  </Text>
                </Row>
              </View>
            ))}
            <View style={{ height: space.sm }} />
            <Small>Sandbox — no real money moves.</Small>
            <View style={{ height: space.md }} />
            <Button
              label={busy ? 'Working…' : `Hold ${rupees(e.amountPaise)} in escrow`}
              onPress={pay}
              disabled={busy}
            />
          </Card>
        )}

        {e.status === 'agreed' && isSeeker && !agenda?.lockedAt && (
          <Card>
            <Body>
              Lock the agenda before paying — money is held against the goals you both agreed, so
              there has to be an agreed list first.
            </Body>
            <View style={{ height: space.sm }} />
            <Button label="Open the agenda" variant="secondary" onPress={() => router.push(`/engagement/${id}/agenda`)} />
          </Card>
        )}

        {e.status === 'agreed' && isProvider && (
          <Card>
            <Body>
              Terms agreed. Work starts once they have paid into escrow and the agenda is locked —
              you will see this move on its own.
            </Body>
          </Card>
        )}

        {/*
          The two steps that were missing entirely on mobile: a seeker
          could not hand work over and a mentor could not mark it, so the
          core loop dead-ended on the phone and both sides had to open a
          laptop midway through something they had started here.
        */}
        {e.status === 'working' && isSeeker && (
          <Card>
            <Body>Escrow is held and the goals are locked. Send your work when it is ready.</Body>
            <View style={{ height: space.sm }} />
            <Button
              label="Send my work"
              busy={busy}
              onPress={() =>
                void act(`/engagements/${id}/submissions`, undefined, {
                  note: 'Sent from the app',
                })
              }
            />
          </Card>
        )}

        {e.status === 'working' && isProvider && (
          <Card>
            <Body>Waiting for their work. You will be able to mark it as soon as it arrives.</Body>
          </Card>
        )}

        {e.status === 'delivered' && isProvider && (
          <Card>
            <Body>Their work is in. Mark it against the rubric this engagement froze when you agreed.</Body>
            <View style={{ height: space.sm }} />
            <Button label="Mark the work" onPress={() => router.push(`/engagement/${id}/evaluate`)} />
          </Card>
        )}

        {e.status === 'delivered' && isSeeker && (
          <Card>
            <Body>Sent. Your {words.provider.toLowerCase()} is marking it now.</Body>
          </Card>
        )}

        {e.status === 'assessed' && isProvider && (
          <Card>
            <Body>Marks returned. Waiting for them to accept, which releases the money.</Body>
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
