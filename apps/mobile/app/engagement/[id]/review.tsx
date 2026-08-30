import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, ErrorNote, H1, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { label } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, TOUCH, radius, space, type } from '@/theme/tokens';

/** Five taps, thumb-sized. A slider is the wrong control for a 1–5 judgement. */
function StarPicker({
  value,
  onChange,
  size = 40,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: number;
}): JSX.Element {
  return (
    <Row gap={space.xs} align="center">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} out of 5`}
          accessibilityState={{ selected: value === n }}
          onPress={() => onChange(n)}
          style={{ width: size, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: size * 0.72, color: n <= value ? C.warn : C.rule }}>★</Text>
        </Pressable>
      ))}
    </Row>
  );
}

/**
 * Leaving a review.
 *
 * One overall star, plus a score on each dimension the family declares.
 * The dimensions are pack data — this screen names none of them, and a
 * family with none simply shows the overall rating.
 */
export default function LeaveReview(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { domain, lang } = useStore();
  const words = useWords();

  const dimensions = domain?.reviewDimensions ?? [];
  const [rating, setRating] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [body, setBody] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api(`/engagements/${id}/reviews`, {
        method: 'POST',
        body: {
          direction: 'seeker_on_provider',
          rating,
          bodyOriginal: body,
          bodyLang: lang,
          dimensionScores: Object.entries(scores).map(([dimensionCode, score]) => ({ dimensionCode, score })),
        },
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not save your review.' },
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
      <Stack.Screen options={{ title: 'Leave a review' }} />
        <H1>Thank you</H1>
        <Body muted>
          Recorded against the skills this {words.engagement.toLowerCase()} actually needed. It cannot be edited —
          neither can theirs about you.
        </Body>
        <View style={{ height: space.xl }} />
        <Button label="Done" onPress={() => router.replace(`/engagement/${id}`)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>How did it go?</H1>
      <Body muted>Only people who finished a paid {words.engagement.toLowerCase()} can leave one of these.</Body>
      <View style={{ height: space.xl }} />
      <ErrorNote error={error} />

      <Card>
        <Small>Overall</Small>
        <StarPicker value={rating} onChange={setRating} />
      </Card>

      {dimensions.length > 0 && (
        <Section title="A bit more detail">
          <View style={{ gap: space.md }}>
            {dimensions.map((d) => (
              <Card key={d.code}>
                <Text style={[type.bodyStrong, { color: C.ink }]}>{label(d.labels, lang)}</Text>
                <StarPicker
                  size={32}
                  value={scores[d.code] ?? 0}
                  onChange={(n) => setScores({ ...scores, [d.code]: n })}
                />
              </Card>
            ))}
          </View>
          <View style={{ height: space.sm }} />
          <Small>Optional — skip any that do not apply.</Small>
        </Section>
      )}

      <Section title="In your own words">
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          placeholder="What did they actually help you fix?"
          placeholderTextColor={C.inkFaint}
          style={{
            height: 120, borderWidth: 1, borderColor: C.rule, borderRadius: radius.md,
            backgroundColor: C.surface, padding: space.md, textAlignVertical: 'top',
            fontSize: 16, color: C.ink,
          }}
        />
        <View style={{ height: space.sm }} />
        <Small>Written in {lang}, and kept in {lang}. They can reply once, and neither of you can edit afterwards.</Small>
      </Section>

      <Button label="Leave the review" busy={busy} disabled={rating === 0} onPress={() => void submit()} />
    </Screen>
  );
}
