import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Body, Button, Chip, ErrorNote, Eyebrow, Field, H1, Row, Screen, Section } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { engagementTypeLabel, languageName, leafCategories } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { space } from '@/theme/tokens';

/**
 * Posting what you need.
 *
 * A budget range, not a price: the seeker says what they can spend and
 * providers propose within it. Nothing here or on the list that follows
 * sorts by what a proposal costs (#15) — the range exists so people who
 * cannot help at that level do not waste anyone's time, not so the
 * cheapest wins.
 */
export default function NewPost(): JSX.Element {
  const router = useRouter();
  const { domain, categories, lang } = useStore();
  const words = useWords();

  const options = useMemo(() => leafCategories(categories, lang), [categories, lang]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [engagementType, setEngagementType] = useState(domain?.engagementTypes[0] ?? 'document_review');
  const [language, setLanguage] = useState(domain?.defaultLanguage ?? 'en');
  const [minRupees, setMinRupees] = useState('');
  const [maxRupees, setMaxRupees] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const band = domain?.priceBands?.[engagementType];

  async function post(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>('/board/posts', {
        method: 'POST',
        body: {
          domainCode: domain?.domainCode,
          categoryId,
          engagementType,
          language,
          currency: 'INR',
          // Rupees in the form, paise on the wire — the conversion
          // happens once, here, and never as a float in the ledger.
          budgetMinPaise: String(Math.round(Number(minRupees) * 100)),
          budgetMaxPaise: String(Math.round(Number(maxRupees) * 100)),
          description,
        },
      });
      router.replace(`/board/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not post this.' },
      );
    } finally {
      setBusy(false);
    }
  }

  const ready =
    categoryId !== null &&
    Number(minRupees) > 0 &&
    Number(maxRupees) >= Number(minRupees) &&
    description.trim().length > 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Post a request' }} />
      <H1>What do you need?</H1>
      <Body muted>People who can help will propose. You choose who, and nothing is charged yet.</Body>
      <View style={{ height: space.xl }} />

      <ErrorNote error={error} />

      <Section title="What kind of help">
        <Row gap={space.sm} wrap>
          {(domain?.engagementTypes ?? []).map((t) => (
            <Chip
              key={t}
              label={engagementTypeLabel(t)}
              selected={t === engagementType}
              onPress={() => setEngagementType(t)}
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
      </Section>

      <Section title="What you can spend">
        {band ? <Eyebrow>{`Most people pay ₹${band[0] / 100} – ₹${band[1] / 100} for this.`}</Eyebrow> : null}
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="From (₹)" value={minRupees} onChangeText={setMinRupees} keyboard="number-pad" placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="To (₹)" value={maxRupees} onChangeText={setMaxRupees} keyboard="number-pad" placeholder="0" />
          </View>
        </Row>
      </Section>

      <Section title="What you want done">
        <Field
          label="Describe it"
          value={description}
          onChangeText={setDescription}
          multiline
          autoCapitalize="sentences"
          placeholder="What you are stuck on, and what would count as help."
        />
      </Section>

      <Button label="Post it" busy={busy} disabled={!ready} onPress={post} />
    </Screen>
  );
}
