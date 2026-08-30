import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, ErrorNote, Field, H1, Loading, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api, rupees } from '@/lib/api';
import { engagementTypeLabel, languageName, plural } from '@/lib/pack';
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

interface Proposal {
  id: string;
  providerId: string;
  message: string;
  proposedAmountPaise: string;
  status: string;
  resultingEngagementId: string | null;
}

/**
 * One request, and what people have proposed.
 *
 * Proposals are rendered in the order the API returns them, which is not
 * by price and cannot be made to be: there is no sort control here at
 * any layer (#15). This is the screen where that rule either holds or
 * quietly stops holding, because it is the one place a seeker is
 * comparing offers side by side.
 */
export default function BoardPostDetail(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, lang } = useStore();
  const words = useWords();

  const [post, setPost] = useState<BoardPost | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [p, props] = await Promise.all([
      api<BoardPost>(`/board/posts/${id}`).catch(() => null),
      api<Proposal[]>(`/board/posts/${id}/proposals`).catch(() => [] as Proposal[]),
    ]);
    setPost(p);
    setProposals(props);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!post) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Request' }} />
        <Loading />
      </Screen>
    );
  }

  const mine = post.seekerId === me?.id;
  const alreadyProposed = proposals.some((p) => p.providerId === me?.id);

  async function propose(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api(`/board/posts/${id}/proposals`, {
        method: 'POST',
        body: { message, proposedAmountPaise: String(Math.round(Number(amount) * 100)) },
      });
      setMessage('');
      setAmount('');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not send that.' },
      );
    } finally {
      setBusy(false);
    }
  }

  async function accept(proposalId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ resultingEngagementId: string | null }>(
        `/board/proposals/${proposalId}/accept`,
        { method: 'POST', idempotencyKey: `accept:${proposalId}` },
      );
      if (res.resultingEngagementId) router.replace(`/engagement/${res.resultingEngagementId}`);
      else await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not accept that.' },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Request' }} />
      <H1>{engagementTypeLabel(post.engagementType)}</H1>
      <Row gap={space.sm} wrap>
        <Chip label={languageName(post.language, lang)} />
        <Chip label={post.status.replace(/_/g, ' ')} tone={post.status === 'open' ? 'good' : 'neutral'} />
      </Row>
      <View style={{ height: space.lg }} />
      <Body>{post.description}</Body>
      <View style={{ height: space.sm }} />
      <Small>
        Budget {rupees(post.budgetMinPaise)} – {rupees(post.budgetMaxPaise)}
      </Small>
      <View style={{ height: space.xl }} />

      <ErrorNote error={error} />

      <Section title={proposals.length === 0 ? 'Proposals' : plural(proposals.length, 'proposal')}>
        {proposals.length === 0 ? (
          <Empty text="Nobody has proposed yet." />
        ) : (
          <View style={{ gap: space.md }}>
            {proposals.map((p) => (
              <Card key={p.id}>
                <Row between align="flex-start">
                  <Text style={[type.bodyStrong, { color: C.ink, flex: 1 }]}>
                    {rupees(p.proposedAmountPaise)}
                  </Text>
                  <Chip label={p.status} tone={p.status === 'accepted' ? 'good' : 'neutral'} />
                </Row>
                {p.message ? <Body>{p.message}</Body> : null}
                {mine && post.status === 'open' && p.status === 'pending' && (
                  <>
                    <View style={{ height: space.sm }} />
                    <Button label="Accept this one" busy={busy} onPress={() => void accept(p.id)} />
                  </>
                )}
              </Card>
            ))}
          </View>
        )}
      </Section>

      {!mine && me?.role === 'provider' && post.status === 'open' && !alreadyProposed && (
        <Section title="Propose">
          <Field
            label="What you would do"
            value={message}
            onChangeText={setMessage}
            multiline
            autoCapitalize="sentences"
            placeholder="How you would approach this, and what they would get back."
          />
          <Field label="Your price (₹)" value={amount} onChangeText={setAmount} keyboard="number-pad" placeholder="0" />
          <Button
            label="Send the proposal"
            busy={busy}
            disabled={Number(amount) <= 0 || message.trim().length === 0}
            onPress={propose}
          />
        </Section>
      )}

      {alreadyProposed && (
        <Small>
          You have already proposed on this. One proposal each — a {words.seeker.toLowerCase()} comparing
          offers should not have to read the same person twice.
        </Small>
      )}
    </Screen>
  );
}
