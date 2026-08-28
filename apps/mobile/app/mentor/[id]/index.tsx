import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Chip, Empty, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { api } from '@/lib/api';
import { label, plural } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, space, type } from '@/theme/tokens';

interface Skill {
  skillId: string;
  labels: Record<string, string>;
  tier: string;
  completedEngagements: number;
  reviewCount: number;
  avgRating: number | null;
}
interface Review {
  id: string;
  rating: number;
  bodyOriginal: string | null;
}
interface Profile {
  providerId: string;
  displayName: string;
  languages: string[];
  skills: Skill[];
  paidWorkBlocked: boolean;
  reviews: Review[];
}

/**
 * A profile shows the conclusion of a verification, never the evidence
 * behind it (#30). There is no route to a credential from here, and there
 * should not be one.
 */
export default function MentorProfile(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useStore();
  const words = useWords();
  const [p, setP] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await api<Profile>(`/providers/${id}`, { anonymous: true }).catch(() => null);
      if (result) setP(result);
      else setMissing(true);
    })();
  }, [id]);

  if (missing) return <Screen><Empty text="This profile is no longer available." /></Screen>;
  if (!p) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: p.displayName }} />

      <Row gap={space.lg} align="flex-start">
        <Avatar name={p.displayName} size={64} />
        <View style={{ flex: 1, gap: space.xs }}>
          <H1>{p.displayName}</H1>
          <Small>Works in {p.languages.join(', ') || '—'}</Small>
        </View>
      </Row>

      {p.paidWorkBlocked && (
        <Card tone="alert" style={{ marginTop: space.lg }}>
          <Text style={[type.bodyStrong, { color: C.correction }]}>Free guidance only</Text>
          <Small>
            A credential on file means this {words.provider.toLowerCase()} cannot take paid work.
          </Small>
        </Card>
      )}

      <View style={{ height: space.xl }} />

      <Section title="Verified for">
        <View style={{ gap: space.md }}>
          {p.skills.map((sk) => (
            <Card key={sk.skillId}>
              <Row between align="flex-start">
                <Text style={[type.bodyStrong, { color: C.ink, flex: 1 }]}>{label(sk.labels, lang)}</Text>
                <Chip label={sk.tier.toUpperCase()} tone="accent" />
              </Row>
              <Row gap={space.md} wrap>
                <Small>
                  {sk.reviewCount > 0
                    ? `★ ${Math.round((sk.avgRating ?? 0) * 10) / 10} · ${plural(sk.reviewCount, 'review')}`
                    : 'No reviews yet'}
                </Small>
                <Small>{sk.completedEngagements} completed</Small>
              </Row>
            </Card>
          ))}
        </View>
      </Section>

      <Section title={plural(p.reviews.length, 'Review')}>
        {p.reviews.length === 0 ? (
          <Empty text="No reviews yet." />
        ) : (
          <View style={{ gap: space.md }}>
            {p.reviews.map((r) => (
              <Card key={r.id}>
                <Text style={[type.body, { color: C.ink }]}>
                  {'★'.repeat(r.rating)}
                  <Text style={{ color: C.inkFaint }}>{'★'.repeat(5 - r.rating)}</Text>
                </Text>
                {r.bodyOriginal ? <Body>{r.bodyOriginal}</Body> : null}
              </Card>
            ))}
          </View>
        )}
      </Section>

      {!p.paidWorkBlocked && (
        <Button label="Book" onPress={() => router.push(`/mentor/${p.providerId}/book`)} />
      )}
    </Screen>
  );
}
