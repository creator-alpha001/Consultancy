import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, ErrorNote, Eyebrow, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api, durationLabel, when } from '@/lib/api';
import { useStore } from '@/lib/store';
import { LIGHT as C, TOUCH, radius, space, type } from '@/theme/tokens';

interface Detail {
  session: {
    id: string; engagementId: string; scheduledStart: string; scheduledEnd: string;
    timezone: string; roomReference: string | null; mode: 'video' | 'audio_only';
    recordingActive: boolean; status: string;
  };
  consents: Array<{ user_id: string; consent_given: boolean | null }>;
  agenda: { items: Array<{ id: string; labelText: string; checkedAt: string | null }> } | null;
}

/**
 * The live session.
 *
 * Two things here are requirements, not features. Recording needs an
 * explicit yes from BOTH people at the start of EVERY session (#21), so
 * declining sits beside agreeing with identical weight — a consent flow
 * with only a yes button is not consent. And audio-only is a first-class
 * fallback (#22), reachable in one tap without asking the other party,
 * because nobody should have to negotiate while their line is failing.
 */
export default function SessionRoom(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useStore();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setD(await api<Detail>(`/sessions/${id}`).catch(() => null));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(path: string, body?: unknown): Promise<void> {
    setBusy(true); setError(null);
    try {
      await api(path, { method: 'POST', body });
      await load();
    } catch (err) {
      setError(err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: 'UNKNOWN', message: 'Something went wrong.' });
    } finally { setBusy(false); }
  }

  if (!d) return <Screen><Loading /></Screen>;

  const s = d.session;
  const mine = d.consents.find((c) => c.user_id === me?.id);
  const myConsent = mine?.consent_given ?? null;
  const everyoneAgreed = d.consents.length > 0 && d.consents.every((c) => c.consent_given === true);
  const live = s.status === 'in_progress';
  const done = d.agenda ? d.agenda.items.filter((i) => i.checkedAt).length : 0;
  const total = d.agenda?.items.length ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: live ? 'Live' : 'Session' }} />
      <ErrorNote error={error} />

      <Card>
        <Row between align="flex-start">
          <View style={{ gap: 2 }}>
            <Text style={[type.title, { color: C.ink }]}>{when(s.scheduledStart)}</Text>
            <Small>{durationLabel(s.scheduledStart, s.scheduledEnd)} · {s.timezone}</Small>
          </View>
          <Chip
            label={s.status.replace(/_/g, ' ')}
            tone={live ? 'good' : s.status === 'cancelled' ? 'alert' : 'neutral'}
          />
        </Row>
      </Card>

      <View style={{ height: space.lg }} />

      <View style={{
        backgroundColor: C.ink, borderRadius: radius.lg, aspectRatio: 4 / 3,
        alignItems: 'center', justifyContent: 'center', padding: space.lg,
      }}>
        <Text style={[type.title, { color: C.paper }]}>
          {live ? (s.mode === 'audio_only' ? 'Audio only' : 'Video') : 'Not started'}
        </Text>
        <View style={{ height: space.xs }} />
        <Text style={[type.small, { color: 'rgba(253,252,247,0.6)', textAlign: 'center' }]}>
          {s.roomReference ? 'Connected' : 'A room opens when the session starts'}
        </Text>
        {s.recordingActive && (
          <View style={{ marginTop: space.md }}>
            <Chip label="● Recording" tone="alert" />
          </View>
        )}
      </View>

      <View style={{ height: space.lg }} />

      <Row gap={space.sm} wrap>
        {s.status === 'scheduled' && (
          <View style={{ flex: 1 }}>
            <Button label="Start" busy={busy} onPress={() => void act(`/sessions/${id}/start`)} />
          </View>
        )}
        {live && (
          <>
            <View style={{ flex: 1 }}>
              <Button label="End" variant="danger" busy={busy} onPress={() => void act(`/sessions/${id}/end`)} />
            </View>
            {s.mode === 'video' && (
              <View style={{ flex: 1 }}>
                <Button
                  label="Audio only"
                  variant="secondary"
                  busy={busy}
                  onPress={() => void act(`/sessions/${id}/audio-only`)}
                />
              </View>
            )}
          </>
        )}
      </Row>

      <View style={{ height: space.xl }} />

      {s.status !== 'completed' && s.status !== 'cancelled' && (
        <Section title="Recording">
          <Card>
            {myConsent === null ? (
              <>
                <Body>This can be recorded, but only if you both agree. You can say no and still have the session.</Body>
                <View style={{ height: space.md }} />
                <Button
                  label="I agree to be recorded"
                  busy={busy}
                  onPress={() => void act(`/sessions/${id}/consent`, { consentGiven: true })}
                />
                <View style={{ height: space.sm }} />
                <Button
                  label="No, do not record"
                  variant="secondary"
                  busy={busy}
                  onPress={() => void act(`/sessions/${id}/consent`, { consentGiven: false })}
                />
              </>
            ) : (
              <>
                <Text style={[type.bodyStrong, { color: C.ink }]}>
                  You said {myConsent ? 'yes' : 'no'}.
                </Text>
                <Small>
                  {everyoneAgreed
                    ? 'Both of you agreed.'
                    : myConsent
                      ? 'Waiting for the other person to decide.'
                      : 'This session will not be recorded.'}
                </Small>
                {everyoneAgreed && (
                  <>
                    <View style={{ height: space.md }} />
                    <Button
                      label={s.recordingActive ? 'Stop recording' : 'Start recording'}
                      variant={s.recordingActive ? 'danger' : 'primary'}
                      busy={busy}
                      onPress={() => void act(`/sessions/${id}/recording`, { active: !s.recordingActive })}
                    />
                  </>
                )}
              </>
            )}
          </Card>
        </Section>
      )}

      <Section title="Agenda" action={total > 0 ? <Small>{done} of {total}</Small> : undefined}>
        {!d.agenda ? (
          <Empty text="The checklist appears once the agenda is locked." />
        ) : (
          <Card>
            <View style={{ gap: space.sm }}>
              {d.agenda.items.map((item, i) => {
                const ticked = !!item.checkedAt;
                const content = (
                  <Row gap={space.md} align="flex-start">
                    <View style={{
                      width: 26, height: 26, borderRadius: 8,
                      backgroundColor: ticked ? C.good : 'transparent',
                      borderWidth: ticked ? 0 : 1, borderColor: C.rule,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 13, color: ticked ? '#fff' : C.inkFaint }}>
                        {ticked ? '✓' : String(i + 1)}
                      </Text>
                    </View>
                    <Text style={[type.body, { color: ticked ? C.inkMuted : C.ink, flex: 1 }]}>
                      {item.labelText}
                    </Text>
                  </Row>
                );
                return live && !ticked ? (
                  <Pressable
                    key={item.id}
                    accessibilityLabel={`Tick: ${item.labelText}`}
                    onPress={() => void act(`/sessions/${id}/agenda-items/${item.id}/tick`)}
                    style={{ minHeight: TOUCH, justifyContent: 'center' }}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View key={item.id} style={{ minHeight: 34, justifyContent: 'center' }}>{content}</View>
                );
              })}
            </View>
            {live && <><View style={{ height: space.sm }} /><Small>Tap a goal as you cover it.</Small></>}
            {!live && total > done && s.status === 'completed' && (
              <>
                <View style={{ height: space.sm }} />
                <Text style={[type.smallStrong, { color: C.correction }]}>
                  {total - done} goal{total - done === 1 ? '' : 's'} were never ticked.
                </Text>
              </>
            )}
          </Card>
        )}
      </Section>
    </Screen>
  );
}
