import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native';
import { Body, Button, Card, Chip, Empty, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { api, rupees } from '@/lib/api';
import { engagementTypeLabel, languageName, plural, pluralWord } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, space, type } from '@/theme/tokens';

interface BoardPost {
  id: string;
  seekerId: string;
  engagementType: string;
  language: string;
  budgetMinPaise: string;
  budgetMaxPaise: string;
  description: string;
  status: string;
}

/**
 * The board.
 *
 * Where someone posts what they need and providers they have never met
 * propose to do it — the half of the marketplace that does not depend on
 * already knowing who to ask. It existed only on the web, so on the
 * client this product is led by, a seeker could only book someone they
 * had already found by search.
 *
 * Ordering is the API's, and it is not by price: nothing here lets a
 * reader sort by what a proposal costs (#15).
 */
export default function Board(): JSX.Element {
  const router = useRouter();
  const { me, lang } = useStore();
  const words = useWords();
  const [posts, setPosts] = useState<BoardPost[] | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const rows = await api<BoardPost[]>('/board/posts').catch(() => [] as BoardPost[]);
    setPosts(rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!me) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'The board' }} />
        <H1>The board</H1>
        <Body muted>Sign in to post what you need, or to see what people are asking for.</Body>
        <View style={{ height: space.xl }} />
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'The board' }} />
      <H1>The board</H1>
      <Body muted>
        Post what you need and let people come to you, rather than searching for someone yourself.
      </Body>
      <View style={{ height: space.xl }} />
      <Button label="Post what you need" onPress={() => router.push('/board/new')} />
      <View style={{ height: space.xl }} />

      <Section title={posts === null ? 'Open requests' : plural(posts.length, 'open request')}>
        {posts === null ? (
          <Loading />
        ) : posts.length === 0 ? (
          <Empty text="Nothing open right now." />
        ) : (
          <View style={{ gap: space.md }}>
            {posts.map((p) => (
              <Card key={p.id} onPress={() => router.push(`/board/${p.id}`)}>
                <Row between align="flex-start">
                  <Text style={[type.bodyStrong, { color: C.ink, flex: 1 }]}>
                    {engagementTypeLabel(p.engagementType)}
                  </Text>
                  <Text style={[type.bodyStrong, { color: C.ink }]}>
                    {rupees(p.budgetMinPaise)}–{rupees(p.budgetMaxPaise)}
                  </Text>
                </Row>
                {p.description ? <Small>{p.description}</Small> : null}
                <Row gap={space.sm} wrap>
                  <Chip label={languageName(p.language, lang)} />
                  {p.seekerId === me.id ? <Chip label="Yours" tone="accent" /> : null}
                </Row>
              </Card>
            ))}
          </View>
        )}
      </Section>

      <Small>
        Proposals are never ordered by price. What someone charges is not a measure of whether they can
        help you.
      </Small>
      <View style={{ height: space.xl }} />
      <Button
        label={`Or search ${pluralWord(words.provider.toLowerCase())}`}
        variant="secondary"
        onPress={() => router.push('/find')}
      />
    </Screen>
  );
}
