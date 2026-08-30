import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, ErrorNote, Field, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { label } from '@/lib/pack';
import { useStore } from '@/lib/store';
import { LIGHT as C, radius, space, type } from '@/theme/tokens';

interface Submission {
  id: string;
  contentRef: string | null;
  note: string;
}

interface Evaluation {
  id: string;
  templateId: string | null;
  dimensions: Array<{ code: string; labels: Record<string, string> }>;
  scores: Array<{ dimensionCode: string; score: number; comment: string }>;
  overallNote: string;
  returnedAt: string | null;
}

const MAX = 100;

/**
 * Marking the work.
 *
 * The mentor's half of the core loop, and it did not exist on mobile at
 * all — a mentor could be booked and paid on the phone and had to open a
 * laptop to do the actual job.
 *
 * The dimensions come from the template bound to this engagement's
 * skills, resolved by the API. This screen names none of them and offers
 * no way to add one: providers must not define their own scale
 * (CLAUDE.md #16), because if two mentors could use different scales no
 * two marks would mean the same thing and the comparison a seeker is
 * paying for would be worthless. An objective category has no template
 * at all (#3), which is a real state this screen handles rather than an
 * error.
 */
export default function Evaluate(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useStore();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const sub = await api<Submission | null>(`/engagements/${id}/submissions/latest`);
        setSubmission(sub);
        let ev = await api<Evaluation | null>(`/engagements/${id}/evaluations/latest`);
        if (!ev && sub) {
          ev = await api<Evaluation>(`/engagements/${id}/evaluations`, {
            method: 'POST',
            body: { submissionId: sub.id },
          });
        }
        setEvaluation(ev);
        if (ev) {
          setNote(ev.overallNote ?? '');
          setDraft(
            Object.fromEntries(
              ev.dimensions.map((d) => [
                d.code,
                String(ev!.scores.find((s) => s.dimensionCode === d.code)?.score ?? ''),
              ]),
            ),
          );
        }
      } catch (err) {
        setError(
          err instanceof ApiError
            ? { code: err.code, message: err.message }
            : { code: 'UNKNOWN', message: 'Could not open the evaluation.' },
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const dims = evaluation?.dimensions ?? [];
  const scored = dims.filter((d) => draft[d.code] !== '' && draft[d.code] !== undefined).length;
  const complete = dims.length > 0 && scored === dims.length;

  async function submitMarks(): Promise<void> {
    if (!evaluation) return;
    setBusy(true);
    setError(null);
    try {
      // Every dimension in one pass, then return. The API refuses a
      // return with any dimension unscored and a trigger enforces it, so
      // this does not need to re-check — only to not lose half the marks
      // if one call fails.
      for (const d of dims) {
        await api(`/evaluations/${evaluation.id}/scores`, {
          method: 'POST',
          body: { dimensionCode: d.code, score: Number(draft[d.code]) },
        });
      }
      await api(`/evaluations/${evaluation.id}/return`, {
        method: 'POST',
        body: { overallNote: note },
      });
      router.replace(`/engagement/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not return the evaluation.' },
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Mark the work' }} />
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Mark the work' }} />
      <H1>Mark the work</H1>
      <ErrorNote error={error} />

      {submission && (
        <Section title="What they sent">
          <Card>
            {/*
              A pointer, not a file. There is no object storage behind it
              yet (CLAUDE.md #29 is unmet), so this says what it has
              rather than pretending to show a document.
            */}
            <Small>{submission.contentRef ?? 'No attachment'}</Small>
            {submission.note ? <Body>{submission.note}</Body> : null}
          </Card>
        </Section>
      )}

      {dims.length === 0 ? (
        <Section title="No rubric for this">
          <Card>
            <Body>
              This category has no rubric, so there is nothing to score. Write what you found instead.
            </Body>
          </Card>
        </Section>
      ) : (
        <Section title={`Rubric — ${scored} of ${dims.length} scored`}>
          <View style={{ gap: space.md }}>
            {dims.map((d) => (
              <Card key={d.code}>
                <Text style={[type.bodyStrong, { color: C.ink }]}>{label(d.labels, lang) || d.code}</Text>
                <Row gap={space.sm} align="center">
                  <View style={{ flex: 1 }}>
                    <Field
                      label={`Out of ${MAX}`}
                      value={draft[d.code] ?? ''}
                      onChangeText={(v) =>
                        setDraft((prev) => ({ ...prev, [d.code]: v.replace(/[^0-9]/g, '') }))
                      }
                      keyboard="number-pad"
                      placeholder="0"
                    />
                  </View>
                </Row>
              </Card>
            ))}
          </View>
        </Section>
      )}

      <Section title="What they should take away">
        <Field
          label="Overall note"
          value={note}
          onChangeText={setNote}
          multiline
          autoCapitalize="sentences"
          placeholder="The one thing to change next time, and why."
        />
      </Section>

      <View style={{ borderRadius: radius.lg }}>
        <Button
          label="Return the marks"
          busy={busy}
          disabled={dims.length > 0 && !complete}
          onPress={submitMarks}
        />
        {dims.length > 0 && !complete && (
          <View style={{ marginTop: space.sm }}>
            <Small>Every dimension has to be scored before this can be returned.</Small>
          </View>
        )}
      </View>
    </Screen>
  );
}
