import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Body,
  Button,
  Card,
  Empty,
  ErrorNote,
  H1,
  H3,
  Loading,
  Row,
  Screen,
  Section,
  Small,
} from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { LIGHT as C, space, type } from '@/theme/tokens';

interface Trend {
  dimensionCode: string;
  labels: Record<string, string>;
  points: Array<{ engagementId: string; score: number; at: string }>;
  first: number;
  latest: number;
  change: number;
}

interface ActionItem {
  annotationId: string;
  engagementId: string;
  ordinal: number;
  bodyText: string;
  bodyLang: string;
  returnedAt: string;
  doneAt: string | null;
}

interface Progress {
  trends: Trend[];
  evaluationsReturned: number;
  actionItems: ActionItem[];
}

/**
 * Your own progress, on the phone.
 *
 * Same rule as the web screen and the same reason: CLAUDE.md #17 and #24.
 * No percentile, no rank, no comparison to another aspirant, no streak.
 * This population spends years being ranked and has a documented
 * mental-health crisis; one more league table would be harm dressed up as
 * engagement.
 *
 * The action items are the part that matters on a phone. They are what
 * someone re-reads on a train the day after a session, and they were the
 * one thing the mobile app had no way to show at all.
 */
export default function ProgressScreen(): JSX.Element {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setProgress(await api<Progress>('/me/progress'));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not load your progress.' },
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: ActionItem): Promise<void> {
    setBusy(true);
    try {
      await api(`/me/action-items/${item.annotationId}`, {
        method: 'POST',
        body: { done: item.doneAt === null },
      });
      await load();
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'That did not save.' },
      );
    } finally {
      setBusy(false);
    }
  }

  if (!progress) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Progress' }} />
        <Loading />
      </Screen>
    );
  }

  const outstanding = progress.actionItems.filter((a) => a.doneAt === null);
  const done = progress.actionItems.filter((a) => a.doneAt !== null);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Progress' }} />
      <H1>Progress</H1>
      <Small>Measured against your own earlier work, and nothing else.</Small>
      <View style={{ height: space.lg }} />
      <ErrorNote error={error} />

      <Section title="How your marks have moved">
        {progress.trends.length === 0 ? (
          <Empty
            text="Nothing to compare yet. A second marked answer is what makes a first one mean something."
            action={<Button label="Find someone" variant="secondary" onPress={() => router.push('/(tabs)/find')} />}
          />
        ) : (
          progress.trends.map((trend) => (
            <Card key={trend.dimensionCode}>
              <Row between align="flex-start">
                <Text style={[type.bodyStrong, { color: C.ink, flex: 1 }]}>
                  {trend.labels.en ?? trend.dimensionCode.replace(/_/g, ' ')}
                </Text>
                {/*
                  The word, not only a colour or an arrow. And "unchanged"
                  is a real answer — a flat line should not be dressed up
                  as movement in either direction.
                */}
                <Text
                  style={[
                    type.small,
                    {
                      color:
                        trend.change > 0 ? C.good : trend.change < 0 ? C.warn : C.inkMuted,
                    },
                  ]}
                >
                  {trend.change > 0
                    ? `up ${trend.change}`
                    : trend.change < 0
                      ? `down ${Math.abs(trend.change)}`
                      : 'unchanged'}
                </Text>
              </Row>
              <View style={{ height: space.sm }} />
              <Small>
                {trend.first} → {trend.latest} · {trend.points.map((p) => p.score).join(' · ')}
              </Small>
            </Card>
          ))
        )}
      </Section>

      <Section title="What you were asked to work on">
        {progress.actionItems.length === 0 ? (
          <Empty text="These appear when a reviewer marks your work and leaves remarks on it." />
        ) : (
          <>
            {outstanding.length === 0 ? (
              <Card>
                {/* Stated plainly. No congratulation. */}
                <Body>Nothing outstanding. Everything your reviewers raised is ticked.</Body>
              </Card>
            ) : (
              outstanding.map((item) => (
                <Card key={item.annotationId}>
                  <Body>{item.bodyText}</Body>
                  <View style={{ height: space.sm }} />
                  <Small>Remark {item.ordinal}</Small>
                  <View style={{ height: space.md }} />
                  <Row gap={space.sm} wrap>
                    <Button
                      label={busy ? 'Saving…' : 'I have done this'}
                      variant="secondary"
                      disabled={busy}
                      onPress={() => void toggle(item)}
                    />
                    <Button
                      label="See it on the answer"
                      variant="secondary"
                      onPress={() => router.push(`/engagement/${item.engagementId}`)}
                    />
                  </Row>
                </Card>
              ))
            )}

            {done.length > 0 && (
              <>
                <View style={{ height: space.md }} />
                <H3>{done.length} you have done</H3>
                {done.map((item) => (
                  <Card key={item.annotationId}>
                    <Small>{item.bodyText}</Small>
                    <View style={{ height: space.sm }} />
                    {/* Undoable: a one-way tick makes the list lie. */}
                    <Button
                      label="Not done after all"
                      variant="secondary"
                      disabled={busy}
                      onPress={() => void toggle(item)}
                    />
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </Section>
    </Screen>
  );
}
