import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, ErrorNote, Field, H1, Loading, Screen, Small } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { label } from '@/lib/pack';
import { useStore } from '@/lib/store';
import { LIGHT as C, radius, space, type } from '@/theme/tokens';

interface Reason {
  code: string;
  labels: Record<string, string>;
  isWelfareConcern: boolean;
}

interface RaiseResult {
  contentHeld: boolean;
  supportResources?: Array<{ label: string; value: string }>;
}

/**
 * Reporting something.
 *
 * The reasons are fetched, never hardcoded: the family declares them
 * (safety policy is family-owned), so a second family gets its own list
 * without this screen changing.
 *
 * The copy here is deliberately plain. Someone reaching this screen has
 * usually just had something unpleasant happen to them, and the last
 * thing they need is a form that reads like a legal notice or asks them
 * to categorise their own experience three times.
 */
export default function Report(): JSX.Element {
  const router = useRouter();
  const { subjectType, subjectId, what } = useLocalSearchParams<{
    subjectType: string;
    subjectId: string;
    what?: string;
  }>();
  const { domain, lang } = useStore();
  const [reasons, setReasons] = useState<Reason[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [done, setDone] = useState<RaiseResult | null>(null);

  useEffect(() => {
    if (!domain) return;
    void api<Reason[]>(`/report-reasons?domainCode=${domain.domainCode}`, { anonymous: true })
      .then(setReasons)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? { code: err.code, message: err.message }
            : { code: 'UNKNOWN', message: 'Could not load the reporting options.' },
        ),
      );
  }, [domain]);

  async function submit(): Promise<void> {
    if (!chosen || !domain) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<RaiseResult>('/reports', {
        method: 'POST',
        body: {
          subjectType,
          subjectId,
          reasonCode: chosen,
          detailOriginal: detail.trim() === '' ? undefined : detail.trim(),
          detailLang: detail.trim() === '' ? undefined : lang,
          domainCode: domain.domainCode,
        },
      });
      setDone(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not send the report.' },
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Reported' }} />
        <H1>Thank you for telling us</H1>
        <View style={{ height: space.lg }} />
        <Body>A person will read this. We will not tell them who reported it.</Body>
        <View style={{ height: space.md }} />
        {done.contentHeld && (
          <Card>
            <Body>This is out of public view while it is reviewed.</Body>
          </Card>
        )}
        {done.supportResources && done.supportResources.length > 0 && (
          <Card>
            <Text style={[type.bodyStrong, { color: C.ink, marginBottom: space.sm }]}>
              If you need to talk to someone yourself
            </Text>
            {done.supportResources.map((r) => (
              <View key={r.value} style={{ paddingVertical: space.xs }}>
                <Text style={[type.body, { color: C.ink }]}>{r.label}</Text>
                <Text style={[type.bodyStrong, { color: C.accent }]}>{r.value}</Text>
              </View>
            ))}
          </Card>
        )}
        <View style={{ height: space.lg }} />
        <Button label="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Report' }} />
      <H1>{what ? `Report this ${what}` : 'Report this'}</H1>
      <View style={{ height: space.sm }} />
      <Small>A person reviews every report. The person you are reporting is never told who reported them.</Small>
      <View style={{ height: space.xl }} />

      <ErrorNote error={error} />

      {reasons === null ? (
        <Loading />
      ) : (
        <Card style={{ paddingVertical: 0, paddingHorizontal: 0 }}>
          {reasons.map((r, i) => {
            const selected = chosen === r.code;
            return (
              <Text
                key={r.code}
                onPress={() => setChosen(r.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  type.body,
                  {
                    color: selected ? C.accent : C.ink,
                    fontWeight: selected ? '600' : '400',
                    paddingVertical: space.md,
                    paddingHorizontal: space.lg,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: C.rule,
                    borderRadius: radius.md,
                  },
                ]}
              >
                {label(r.labels, lang)}
              </Text>
            );
          })}
        </Card>
      )}

      <View style={{ height: space.lg }} />
      <Field
        label="Anything you want to add (optional)"
        value={detail}
        onChangeText={setDetail}
        multiline
        placeholder="In your own words"
      />

      <Button label="Send report" busy={busy} disabled={chosen === null} onPress={() => void submit()} />
    </Screen>
  );
}
