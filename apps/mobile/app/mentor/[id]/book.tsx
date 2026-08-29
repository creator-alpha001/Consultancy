import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorNote, Eyebrow, H1, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { engagementTypeLabel, languageName, leafCategories } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, radius, space, type } from '@/theme/tokens';

interface Slot {
  startIso: string;
  endIso: string;
  time: string;
  day: string;
  dayKey: string;
}

/**
 * Candidate times, generated locally.
 *
 * These are times the seeker is PROPOSING. The recurring-availability
 * engine (exceptions, buffers, notice periods) is specified and unbuilt,
 * so the copy says "propose" rather than dressing this up as a calendar
 * the mentor has published.
 */
function buildSlots(days: number, minutes: number): Slot[] {
  const hours = [7, 9, 11, 15, 18, 20];
  const now = new Date();
  const out: Slot[] = [];
  for (let d = 1; d <= days; d += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    for (const h of hours) {
      const start = new Date(day);
      start.setHours(h, 0, 0, 0);
      const end = new Date(start.getTime() + minutes * 60_000);
      out.push({
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        time: start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
        day: start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        dayKey: start.toDateString(),
      });
    }
  }
  return out;
}

export default function Book(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { domain, categories, lang, me } = useStore();
  const words = useWords();

  const options = useMemo(() => leafCategories(categories, lang), [categories, lang]);
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? '');
  const [engagementType, setEngagementType] = useState(domain?.engagementTypes[0] ?? 'document_review');
  const [minutes, setMinutes] = useState(60);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [language, setLanguage] = useState(domain?.defaultLanguage ?? 'en');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const band = domain?.priceBands?.[engagementType];
  const [rupeesValue, setRupeesValue] = useState(() => Math.round((band?.[0] ?? 8000) / 100));

  const needsSlot = engagementType === 'live_session';
  const slots = useMemo(() => buildSlots(10, minutes), [minutes]);
  const days = useMemo(() => [...new Map(slots.map((s) => [s.dayKey, s])).values()], [slots]);
  const activeDay = dayKey ?? days[0]?.dayKey ?? null;
  const daySlots = slots.filter((s) => s.dayKey === activeDay);

  async function submit(): Promise<void> {
    if (!me) {
      router.push('/sign-in');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const engagement = await api<{ id: string }>('/engagements', {
        method: 'POST',
        body: {
          providerId: id,
          domainCode: domain?.domainCode,
          categoryId,
          engagementType,
          currency: 'INR',
          amountPaise: String(Math.round(rupeesValue * 100)),
          language,
        },
      });

      if (needsSlot && slot) {
        await api(`/engagements/${engagement.id}/sessions`, {
          method: 'POST',
          body: {
            scheduledStart: slot.startIso,
            scheduledEnd: slot.endIso,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
          },
        }).catch(() => undefined); // the engagement stands either way
      }

      router.replace(`/engagement/${engagement.id}/agenda`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Something went wrong. Try again.' },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Book' }} />
      <H1>Book</H1>
      <Body muted>Nothing is charged yet.</Body>
      <View style={{ height: space.lg }} />
      <ErrorNote error={error} />

      <Section title="What do you need?">
        <Row gap={space.sm} wrap>
          {(domain?.engagementTypes ?? []).map((t) => (
            <Chip
              key={t}
              label={engagementTypeLabel(t)}
              selected={t === engagementType}
              onPress={() => {
                setEngagementType(t);
                const b = domain?.priceBands?.[t];
                if (b) setRupeesValue(Math.round(b[0] / 100));
              }}
            />
          ))}
        </Row>
      </Section>

      <Section title={`Which ${words.category.toLowerCase()}?`}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {options.map((o) => (
            <Chip key={o.id} label={o.label} selected={o.id === categoryId} onPress={() => setCategoryId(o.id)} />
          ))}
        </ScrollView>
      </Section>

      {needsSlot && (
        <Section title="Propose a time">
          <Eyebrow>How long</Eyebrow>
          <Row gap={space.sm} wrap>
            {[30, 45, 60, 90].map((m) => (
              <Chip
                key={m}
                label={`${m} min`}
                selected={m === minutes}
                onPress={() => {
                  setMinutes(m);
                  setSlot(null);
                }}
              />
            ))}
          </Row>

          <View style={{ height: space.lg }} />
          <Eyebrow>Day</Eyebrow>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {days.map((d) => (
              <Chip
                key={d.dayKey}
                label={d.day}
                selected={d.dayKey === activeDay}
                onPress={() => {
                  setDayKey(d.dayKey);
                  setSlot(null);
                }}
              />
            ))}
          </ScrollView>

          <View style={{ height: space.lg }} />
          <Eyebrow>Time</Eyebrow>
          <Row gap={space.sm} wrap>
            {daySlots.map((s) => (
              <Chip
                key={s.startIso}
                label={s.time}
                selected={slot?.startIso === s.startIso}
                onPress={() => setSlot(slot?.startIso === s.startIso ? null : s)}
              />
            ))}
          </Row>

          <View style={{ height: space.sm }} />
          <Small>Times you are proposing — they will confirm.</Small>
        </Section>
      )}

      <Section title="Language">
        <Row gap={space.sm} wrap>
          {(domain?.languages ?? ['en']).map((l) => (
            <Chip
              key={l}
              label={languageName(l, lang)}
              selected={l === language}
              onPress={() => setLanguage(l)}
            />
          ))}
        </Row>
        <View style={{ height: space.sm }} />
        <Small>They must work in this language too.</Small>
      </Section>

      <Section title="Your offer">
        <Card>
          <Row between>
            <Text style={[type.display, { color: C.ink }]}>₹{rupeesValue}</Text>
            <Row gap={space.sm}>
              <Chip label="−" onPress={() => setRupeesValue((v) => Math.max(1, v - 25))} />
              <Chip label="+" onPress={() => setRupeesValue((v) => v + 25)} />
            </Row>
          </Row>
          {band && (
            <Small>
              Most people pay ₹{Math.round(band[0] / 100)} – ₹{Math.round(band[1] / 100)} for this.
            </Small>
          )}
        </Card>
      </Section>

      <View style={{ backgroundColor: C.accentSoft, padding: space.lg, borderRadius: radius.lg, gap: space.sm }}>
        <Text style={[type.bodyStrong, { color: C.ink }]}>Next: agree the goals</Text>
        <Small>
          You will write down what you want and what is out of scope. Once you both agree, your money goes into
          escrow and stays there until you accept the work.
        </Small>
      </View>

      <View style={{ height: space.xl }} />
      <Button
        label={me ? 'Agree terms and continue' : 'Sign in to continue'}
        onPress={() => void submit()}
        busy={busy}
        disabled={needsSlot && !slot}
      />
      {needsSlot && !slot && (
        <View style={{ marginTop: space.sm, alignItems: 'center' }}>
          <Small>Pick a time first.</Small>
        </View>
      )}
    </Screen>
  );
}
