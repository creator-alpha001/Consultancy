import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Chip, Empty, Eyebrow, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { api } from '@/lib/api';
import { label, languageName, leafCategories, plural } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, radius, space, type } from '@/theme/tokens';

interface ProviderSkill {
  skillId: string;
  labels: Record<string, string>;
  tier: string;
  completedEngagements: number;
  reviewCount: number;
  avgRating: number | null;
}
interface ProviderCard {
  providerId: string;
  displayName: string;
  languages: string[];
  skills: ProviderSkill[];
  paidWorkBlocked: boolean;
}

/**
 * Finding someone.
 *
 * The card shows a person, one headline skill with its tier, and their
 * track record — the three things a decision actually turns on. The web
 * build listed every verified skill with "No reviews yet / 0 completed"
 * repeated under each, which buried the person under their own metadata.
 *
 * There is no price filter and no price sort. That is enforced quietly,
 * the way a product enforces things, rather than announced in a paragraph
 * of grey text on the screen.
 */
export default function Find(): JSX.Element {
  const router = useRouter();
  const { categories, lang, domain } = useStore();
  const words = useWords();

  const options = useMemo(() => leafCategories(categories, lang), [categories, lang]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderCard[] | null>(null);

  useEffect(() => {
    if (!categoryId && options.length > 0) setCategoryId(options[0].id);
  }, [options, categoryId]);
  useEffect(() => {
    if (!language && domain) setLanguage(domain.defaultLanguage);
  }, [domain, language]);

  useEffect(() => {
    if (!categoryId || !language) return;
    setProviders(null);
    void (async () => {
      const q = `?categoryId=${encodeURIComponent(categoryId)}&language=${encodeURIComponent(language)}`;
      setProviders(await api<ProviderCard[]>(`/providers${q}`, { anonymous: true }).catch(() => []));
    })();
  }, [categoryId, language]);

  const selected = options.find((o) => o.id === categoryId);

  return (
    <Screen>
      <H1>Find a {words.provider.toLowerCase()}</H1>
      <Body muted>
        Verified for the {words.category.toLowerCase()} you need, in the language you work in.
      </Body>

      <View style={{ marginTop: space.xl, marginBottom: space.lg, gap: space.md }}>
        <View>
          <Eyebrow>{words.category}</Eyebrow>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {options.map((o) => (
              <Chip
                key={o.id}
                label={o.label}
                selected={o.id === categoryId}
                onPress={() => setCategoryId(o.id)}
              />
            ))}
          </ScrollView>
        </View>

        <View>
          <Eyebrow>Language</Eyebrow>
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
        </View>
      </View>

      {providers === null ? (
        <Loading />
      ) : providers.length === 0 ? (
        <Empty
          text={`Nobody is verified for ${selected?.label ?? words.category.toLowerCase()} in ${languageName(language ?? 'en', lang)} yet. Post what you need and let people come to you.`}
          action={<Button label="Post a request" variant="secondary" onPress={() => router.push('/work')} />}
        />
      ) : (
        <Section title={plural(providers.length, words.provider)}>
          <View style={{ gap: space.md }}>
            {providers.map((p) => {
              // One headline skill — the strongest for this search — plus a
              // count. Listing all fourteen tells the reader nothing.
              const top = p.skills[0];
              const others = p.skills.length - 1;
              return (
                <Card key={p.providerId} onPress={() => router.push(`/mentor/${p.providerId}`)}>
                  <Row gap={space.md} align="flex-start">
                    <Avatar name={p.displayName} />
                    <View style={{ flex: 1, gap: space.xs }}>
                      <Text style={[type.bodyStrong, { color: C.ink }]}>{p.displayName}</Text>
                      {top && (
                        <Text style={[type.small, { color: C.inkMuted }]}>
                          {label(top.labels, lang)}
                          {others > 0 ? ` +${others} more` : ''}
                        </Text>
                      )}
                      <Row gap={space.sm} wrap>
                        {top && <Chip label={`${top.tier.toUpperCase()} verified`} tone="accent" />}
                        {top && top.reviewCount > 0 ? (
                          <Chip
                            label={`★ ${Math.round((top.avgRating ?? 0) * 10) / 10} · ${top.reviewCount}`}
                            tone="neutral"
                          />
                        ) : (
                          <Chip label="New here" tone="neutral" />
                        )}
                      </Row>
                    </View>
                  </Row>

                  {p.paidWorkBlocked && (
                    <View style={{ backgroundColor: C.correctionSoft, padding: space.sm, borderRadius: radius.sm }}>
                      <Small muted={false}>
                        <Text style={{ color: C.correction }}>Free guidance only — cannot take paid work.</Text>
                      </Small>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        </Section>
      )}
    </Screen>
  );
}
