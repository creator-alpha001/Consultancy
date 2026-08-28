import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Chip, Empty, Eyebrow, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { api, when } from '@/lib/api';
import { domainLabel, factLabel, label, plural } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, radius, space, type } from '@/theme/tokens';

interface Skill {
  skillId: string;
  labels: Record<string, string>;
  tier: string;
  completedEngagements: number;
  reviewCount: number;
  avgRating: number | null;
}
interface PublicCredential {
  credentialCode: string;
  labels: Record<string, string>;
  domainCode: string;
  verifiedAt: string | null;
  details: Record<string, unknown>;
}
interface TrackRecord {
  completedEngagements: number;
  refundedEngagements: number;
  distinctSeekers: number;
  repeatSeekers: number;
  firstCompletedAt: string | null;
  lastCompletedAt: string | null;
}
interface ReviewSummary {
  reviewCount: number;
  avgRating: number | null;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  repliedCount: number;
  dimensions: Array<{ dimensionCode: string; scoreCount: number; avgScore: number }>;
}
interface Review {
  id: string;
  rating: number;
  bodyOriginal: string;
  bodyLang: string;
  createdAt: string;
  engagementType: string | null;
  skills: Array<{ skillId: string; code: string; labels: Record<string, string> }>;
  dimensionScores: Array<{ dimensionCode: string; score: number }>;
  reply: { bodyOriginal: string; bodyLang: string; createdAt: string } | null;
}
interface Profile {
  providerId: string;
  displayName: string;
  languages: string[];
  skills: Skill[];
  paidWorkBlocked: boolean;
  credentials: PublicCredential[];
  trackRecord: TrackRecord;
  reviewSummary: ReviewSummary;
  reviews: Review[];
}

function Stars({ n, size = 15 }: { n: number; size?: number }): JSX.Element {
  return (
    <Text style={{ fontSize: size, letterSpacing: 1 }}>
      <Text style={{ color: C.warn }}>{'★'.repeat(n)}</Text>
      <Text style={{ color: C.rule }}>{'★'.repeat(5 - n)}</Text>
    </Text>
  );
}

/** One row of the rating histogram. Their own consistency — not a comparison. */
function DistributionBar({ star, count, total }: { star: number; count: number; total: number }): JSX.Element {
  const pct = total === 0 ? 0 : (count / total) * 100;
  return (
    <Row gap={space.sm}>
      <Text style={[type.small, { color: C.inkMuted, width: 12 }]}>{star}</Text>
      <Text style={{ color: C.warn, fontSize: 11 }}>★</Text>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.surfaceSunk, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.warn, borderRadius: 3 }} />
      </View>
      <Text style={[type.small, { color: C.inkMuted, width: 22, textAlign: 'right' }]}>{count}</Text>
    </Row>
  );
}

/**
 * A profile a seeker can actually decide on.
 *
 * Four things, in the order they matter: what this person has ACHIEVED
 * (verified credentials), what they are verified to teach, what their
 * record is, and what people who actually worked with them said.
 *
 * Every credential here is a conclusion. The roll number and the document
 * that proved it are never sent to this screen — the API filters them
 * through an allow-list the family manifest declares (#30).
 */
export default function MentorProfile(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { lang, domain } = useStore();
  const words = useWords();
  const [p, setP] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await api<Profile>(`/providers/${id}`, { anonymous: true }).catch(() => null);
      if (result) setP(result);
      else setMissing(true);
    })();
  }, [id]);

  if (missing) return <Screen><Empty text="This profile is no longer available." /></Screen>;
  if (!p) return <Screen><Loading /></Screen>;

  const s = p.reviewSummary;
  const dimensionLabels = new Map(
    (domain?.reviewDimensions ?? []).map((d) => [d.code, label(d.labels, lang)]),
  );
  const reviews = showAll ? p.reviews : p.reviews.slice(0, 3);

  return (
    <Screen>
      <Stack.Screen options={{ title: p.displayName }} />

      <Row gap={space.lg} align="flex-start">
        <Avatar name={p.displayName} size={64} />
        <View style={{ flex: 1, gap: space.xs }}>
          <H1>{p.displayName}</H1>
          <Small>Works in {p.languages.join(', ') || '—'}</Small>
          {s.reviewCount > 0 && (
            <Row gap={space.sm}>
              <Stars n={Math.round(s.avgRating ?? 0)} />
              <Small>
                {s.avgRating?.toFixed(1)} · {plural(s.reviewCount, 'review')}
              </Small>
            </Row>
          )}
        </View>
      </Row>

      {p.paidWorkBlocked && (
        <Card tone="alert" style={{ marginTop: space.lg }}>
          <Text style={[type.bodyStrong, { color: C.correction }]}>Free guidance only</Text>
          <Small>A credential on file means this {words.provider.toLowerCase()} cannot take paid work.</Small>
        </Card>
      )}

      <View style={{ height: space.xl }} />

      {/* ── Achievements ─────────────────────────────────────────── */}
      <Section title="Achievements">
        {p.credentials.length === 0 ? (
          <Empty text="No verified achievements on file yet." />
        ) : (
          <View style={{ gap: space.md }}>
            {p.credentials.map((c, i) => {
              const facts = Object.entries(c.details);
              return (
                <Card key={`${c.credentialCode}-${i}`}>
                  <Row gap={space.md} align="flex-start">
                    <View style={{
                      width: 34, height: 34, borderRadius: 10, backgroundColor: C.goodSoft,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: C.good, fontSize: 16 }}>✓</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[type.bodyStrong, { color: C.ink }]}>{label(c.labels, lang)}</Text>
                      {facts.length > 0 && (
                        <Row gap={space.sm} wrap>
                          {facts.map(([k, v]) => (
                            <Chip key={k} label={`${factLabel(k)} ${String(v)}`} tone="neutral" />
                          ))}
                        </Row>
                      )}
                      <Small>
                        {domainLabel(c.domainCode)}
                        {c.verifiedAt ? ` · verified ${when(c.verifiedAt).split(',')[0]}` : ''}
                      </Small>
                    </View>
                  </Row>
                </Card>
              );
            })}
          </View>
        )}
      </Section>

      {/* ── Track record ─────────────────────────────────────────── */}
      <Section title="Track record">
        <Card>
          <Row between wrap gap={space.lg}>
            {[
              [p.trackRecord.completedEngagements, 'completed'],
              [p.trackRecord.distinctSeekers, 'people helped'],
              [p.trackRecord.repeatSeekers, 'came back'],
            ].map(([value, caption]) => (
              <View key={String(caption)} style={{ minWidth: 84 }}>
                <Text style={[type.title, { color: C.ink }]}>{String(value)}</Text>
                <Small>{String(caption)}</Small>
              </View>
            ))}
          </Row>
          {p.trackRecord.refundedEngagements > 0 && (
            <>
              <View style={{ height: space.sm }} />
              {/* Shown, not hidden — a record that reports only successes is not a record. */}
              <Small>{p.trackRecord.refundedEngagements} refunded</Small>
            </>
          )}
        </Card>
      </Section>

      {/* ── Verified skills ──────────────────────────────────────── */}
      <Section title="Verified to teach">
        <View style={{ gap: space.md }}>
          {p.skills.map((sk) => (
            <Card key={sk.skillId}>
              <Row between align="flex-start">
                <Text style={[type.bodyStrong, { color: C.ink, flex: 1 }]}>{label(sk.labels, lang)}</Text>
                <Chip label={sk.tier.toUpperCase()} tone="accent" />
              </Row>
              <Small>{sk.completedEngagements} completed in this</Small>
            </Card>
          ))}
        </View>
      </Section>

      {/* ── Reviews ──────────────────────────────────────────────── */}
      <Section title={s.reviewCount === 0 ? 'Reviews' : plural(s.reviewCount, 'Review')}>
        {s.reviewCount === 0 ? (
          <Empty text={`New here. No reviews yet — every one on this platform comes from a finished, paid ${words.engagement.toLowerCase()}.`} />
        ) : (
          <>
            <Card>
              <Row gap={space.xl} align="flex-start">
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={[type.display, { color: C.ink }]}>{s.avgRating?.toFixed(1)}</Text>
                  <Stars n={Math.round(s.avgRating ?? 0)} />
                  <Small>{plural(s.reviewCount, 'review')}</Small>
                </View>
                <View style={{ flex: 1, gap: space.xs, paddingTop: 2 }}>
                  {[5, 4, 3, 2, 1].map((star) => (
                    <DistributionBar
                      key={star}
                      star={star}
                      count={s.distribution[String(star) as '1'] ?? 0}
                      total={s.reviewCount}
                    />
                  ))}
                </View>
              </Row>

              {s.dimensions.length > 0 && (
                <>
                  <View style={{ height: space.lg, borderBottomWidth: 1, borderBottomColor: C.rule }} />
                  <View style={{ height: space.md }} />
                  <View style={{ gap: space.sm }}>
                    {s.dimensions.map((d) => (
                      <Row key={d.dimensionCode} between>
                        <Text style={[type.small, { color: C.ink, flex: 1 }]}>
                          {dimensionLabels.get(d.dimensionCode) ?? d.dimensionCode}
                        </Text>
                        <Row gap={space.sm}>
                          <View style={{ width: 76, height: 6, borderRadius: 3, backgroundColor: C.surfaceSunk }}>
                            <View style={{
                              width: `${(d.avgScore / 5) * 100}%`, height: '100%',
                              borderRadius: 3, backgroundColor: C.accent,
                            }} />
                          </View>
                          <Text style={[type.smallStrong, { color: C.ink, width: 26, textAlign: 'right' }]}>
                            {d.avgScore.toFixed(1)}
                          </Text>
                        </Row>
                      </Row>
                    ))}
                  </View>
                </>
              )}

              {s.repliedCount > 0 && (
                <>
                  <View style={{ height: space.sm }} />
                  <Small>Replied to {s.repliedCount} of {s.reviewCount}</Small>
                </>
              )}
            </Card>

            <View style={{ height: space.md }} />

            <View style={{ gap: space.md }}>
              {reviews.map((r) => (
                <Card key={r.id}>
                  <Row between align="flex-start">
                    <Stars n={r.rating} />
                    <Small>{when(r.createdAt).split(',')[0]}</Small>
                  </Row>

                  {/* What this review is actually about — the thing that makes it credible. */}
                  {r.skills.length > 0 && (
                    <Row gap={space.xs} wrap>
                      {r.skills.slice(0, 2).map((sk) => (
                        <Chip key={sk.skillId} label={label(sk.labels, lang)} tone="neutral" />
                      ))}
                      {r.engagementType && (
                        <Chip label={r.engagementType.replace(/_/g, ' ')} tone="neutral" />
                      )}
                    </Row>
                  )}

                  {r.bodyOriginal ? (
                    <Text style={[type.body, { color: C.ink }]}>{r.bodyOriginal}</Text>
                  ) : null}

                  {r.dimensionScores.length > 0 && (
                    <Row gap={space.sm} wrap>
                      {r.dimensionScores.map((d) => (
                        <Chip
                          key={d.dimensionCode}
                          label={`${dimensionLabels.get(d.dimensionCode) ?? d.dimensionCode} ${d.score}/5`}
                          tone={d.score >= 4 ? 'good' : d.score <= 2 ? 'alert' : 'neutral'}
                        />
                      ))}
                    </Row>
                  )}

                  {r.reply && (
                    <View style={{
                      marginTop: space.xs, padding: space.md, borderRadius: radius.md,
                      backgroundColor: C.surfaceSunk, gap: 3,
                    }}>
                      <Eyebrow>{p.displayName} replied</Eyebrow>
                      <Text style={[type.small, { color: C.ink }]}>{r.reply.bodyOriginal}</Text>
                    </View>
                  )}
                </Card>
              ))}
            </View>

            {p.reviews.length > 3 && !showAll && (
              <View style={{ marginTop: space.md }}>
                <Button
                  label={`Read all ${p.reviews.length}`}
                  variant="secondary"
                  onPress={() => setShowAll(true)}
                />
              </View>
            )}
          </>
        )}
      </Section>

      {!p.paidWorkBlocked && (
        <Button label="Book" onPress={() => router.push(`/mentor/${p.providerId}/book`)} />
      )}
    </Screen>
  );
}
