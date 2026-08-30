import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorNote, Eyebrow, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { LIGHT as C, TOUCH, radius, space, type } from '@/theme/tokens';

interface Agenda {
  id: string; version: number; originalLang: string;
  outOfScopeText: string | null; successCriteria: string | null; expectedDeliverable: string | null;
  lockedAt: string | null; contentHash: string | null;
  items: Array<{ id: string; labelText: string; checkedAt: string | null }>;
}

const MAX_GOALS = 5;

/**
 * The agenda.
 *
 * Goals are discrete and checkable because they get ticked later — in a
 * live session, and in a dispute. "Out of scope" gets its own field and
 * its own weight because without it "review my answer" quietly becomes
 * "rewrite my answer".
 */
export default function AgendaScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lang } = useStore();
  const [agenda, setAgenda] = useState<Agenda | null | undefined>(undefined);
  const [goals, setGoals] = useState<string[]>(['', '']);
  const [outOfScope, setOutOfScope] = useState('');
  const [success, setSuccess] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setAgenda(await api<Agenda | null>(`/engagements/${id}/agenda`).catch(() => null));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function fail(err: unknown): void {
    setError(err instanceof ApiError
      ? { code: err.code, message: err.message }
      : { code: 'UNKNOWN', message: 'Something went wrong.' });
  }

  async function saveDraft(): Promise<void> {
    const items = goals.map((g) => g.trim()).filter(Boolean).map((t) => ({ labelLang: lang, labelText: t }));
    if (items.length === 0) {
      setError({ code: 'NO_GOALS', message: 'Add at least one goal.' });
      return;
    }
    setBusy(true); setError(null);
    try {
      await api(`/engagements/${id}/agenda`, {
        method: 'POST',
        body: {
          originalLang: lang,
          expectedDeliverable: deliverable,
          successCriteria: success,
          outOfScope,
          context: '',
          items,
        },
      });
      await load();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  async function lock(): Promise<void> {
    if (!agenda) return;
    setBusy(true); setError(null);
    try {
      await api(`/agendas/${agenda.id}/lock`, { method: 'POST' });
      await load();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  if (agenda === undefined) return <Screen><Loading /></Screen>;

  if (agenda === null) {
    const filled = goals.filter((g) => g.trim()).length;
    return (
      <Screen>
      <Stack.Screen options={{ title: 'Goals' }} />
        <H1>What do you need?</H1>
        <Body muted>Write it down together. Both of you have to agree before anything starts.</Body>
        <View style={{ height: space.xl }} />
        <ErrorNote error={error} />

        <Section title="Goals">
          <View style={{ gap: space.sm }}>
            {goals.map((g, i) => (
              <Row key={i} gap={space.sm} align="flex-start">
                <View style={{
                  width: 28, height: TOUCH, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={[type.smallStrong, { color: C.inkFaint }]}>{i + 1}</Text>
                </View>
                <TextInput
                  value={g}
                  onChangeText={(v) => setGoals(goals.map((x, j) => (j === i ? v : x)))}
                  placeholder={i === 0 ? 'e.g. Mark this answer against the rubric' : 'Another checkable goal'}
                  placeholderTextColor={C.inkFaint}
                  style={{
                    flex: 1, minHeight: TOUCH, borderWidth: 1, borderColor: C.rule,
                    borderRadius: radius.md, backgroundColor: C.surface,
                    paddingHorizontal: space.md, fontSize: 16, color: C.ink,
                  }}
                />
                {goals.length > 1 && (
                  <Pressable
                    accessibilityLabel={`Remove goal ${i + 1}`}
                    onPress={() => setGoals(goals.filter((_, j) => j !== i))}
                    style={{ width: 36, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 18, color: C.inkFaint }}>✕</Text>
                  </Pressable>
                )}
              </Row>
            ))}
          </View>
          {goals.length < MAX_GOALS && (
            <View style={{ marginTop: space.md }}>
              <Chip label="+ Add a goal" onPress={() => setGoals([...goals, ''])} />
            </View>
          )}
        </Section>

        <Section title="Out of scope">
          <TextInput
            value={outOfScope}
            onChangeText={setOutOfScope}
            multiline
            placeholder="e.g. Doing the work for me. Promising a particular result."
            placeholderTextColor={C.inkFaint}
            style={{
              height: 90, borderWidth: 1, borderColor: C.correction, borderRadius: radius.md,
              backgroundColor: C.surface, padding: space.md, textAlignVertical: 'top',
              fontSize: 16, color: C.ink,
            }}
          />
          <View style={{ height: space.sm }} />
          <Small>Protects you both from a disappointing surprise.</Small>
        </Section>

        <Section title="You will know it worked if…">
          <TextInput
            value={success}
            onChangeText={setSuccess}
            multiline
            placeholder="e.g. I can name the two things that cost me marks."
            placeholderTextColor={C.inkFaint}
            style={{
              height: 78, borderWidth: 1, borderColor: C.rule, borderRadius: radius.md,
              backgroundColor: C.surface, padding: space.md, textAlignVertical: 'top',
              fontSize: 16, color: C.ink,
            }}
          />
        </Section>

        <Section title="What you expect to receive">
          <TextInput
            value={deliverable}
            onChangeText={setDeliverable}
            placeholder="e.g. The marked answer with margin notes"
            placeholderTextColor={C.inkFaint}
            style={{
              minHeight: TOUCH, borderWidth: 1, borderColor: C.rule, borderRadius: radius.md,
              backgroundColor: C.surface, paddingHorizontal: space.md, fontSize: 16, color: C.ink,
            }}
          />
        </Section>

        <Button label="Save" busy={busy} disabled={filled === 0} onPress={() => void saveDraft()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Row between>
        <H1>Version {agenda.version}</H1>
        <Chip label={agenda.lockedAt ? 'Locked' : 'Draft'} tone={agenda.lockedAt ? 'accent' : 'neutral'} />
      </Row>
      <View style={{ height: space.lg }} />
      <ErrorNote error={error} />

      <Section title="Goals">
        <Card>
          <View style={{ gap: space.md }}>
            {agenda.items.map((item, i) => (
              <Row key={item.id} gap={space.sm} align="flex-start">
                <View style={{
                  width: 22, height: 22, borderRadius: 7,
                  backgroundColor: item.checkedAt ? C.good : 'transparent',
                  borderWidth: item.checkedAt ? 0 : 1, borderColor: C.rule,
                  alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  <Text style={{ fontSize: 12, color: item.checkedAt ? '#fff' : C.inkFaint }}>
                    {item.checkedAt ? '✓' : String(i + 1)}
                  </Text>
                </View>
                <Text style={[type.body, { color: C.ink, flex: 1 }]}>{item.labelText}</Text>
              </Row>
            ))}
          </View>
        </Card>
      </Section>

      {agenda.outOfScopeText ? (
        <Section title="Out of scope">
          <Card tone="alert">
            <Text style={[type.body, { color: C.ink }]}>{agenda.outOfScopeText}</Text>
          </Card>
        </Section>
      ) : null}

      {agenda.successCriteria ? (
        <Section title="Success looks like">
          <Card><Text style={[type.body, { color: C.ink }]}>{agenda.successCriteria}</Text></Card>
        </Section>
      ) : null}

      {agenda.lockedAt ? (
        <Card>
          <Eyebrow>Agreed and sealed</Eyebrow>
          <Small>Both of you hold this same copy. Changes need a new version you both accept.</Small>
        </Card>
      ) : (
        <Section title="Lock it">
          <Card>
            <Pressable
              onPress={() => setConfirmed(!confirmed)}
              style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: TOUCH }}
            >
              <View style={{
                width: 24, height: 24, borderRadius: 7, marginTop: 2,
                backgroundColor: confirmed ? C.accent : 'transparent',
                borderWidth: confirmed ? 0 : 1, borderColor: C.rule,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {confirmed && <Text style={{ color: '#fff', fontSize: 13 }}>✓</Text>}
              </View>
              <Text style={[type.body, { color: C.ink, flex: 1 }]}>
                I have read these goals and what is out of scope, and I agree to them.
              </Text>
            </Pressable>
            <View style={{ height: space.md }} />
            <Button label="Lock the agenda" busy={busy} disabled={!confirmed} onPress={() => void lock()} />
            <View style={{ height: space.sm }} />
            <Small>After this it cannot be edited.</Small>
          </Card>
        </Section>
      )}
    </Screen>
  );
}
