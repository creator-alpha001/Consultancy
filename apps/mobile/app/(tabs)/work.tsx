import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, H1, Loading, Row, Screen, Section, Small, Stepper } from '@/components/kit';
import { api, rupees, when } from '@/lib/api';
import { useStore } from '@/lib/store';
import { LIGHT as C, space, type } from '@/theme/tokens';

interface Engagement {
  id: string;
  engagementType: string | null;
  status: string;
  amountPaise: string | null;
  createdAt: string;
}

const OPEN = ['draft', 'agreed', 'working', 'delivered', 'assessed', 'disputed'];

export default function Work(): JSX.Element {
  const router = useRouter();
  const { me } = useStore();
  const [rows, setRows] = useState<Engagement[] | null>(null);
  const [tab, setTab] = useState<'open' | 'done'>('open');

  useEffect(() => {
    if (!me) { setRows([]); return; }
    void (async () => setRows(await api<Engagement[]>('/engagements').catch(() => [])))();
  }, [me]);

  if (!me) {
    return (
      <Screen>
        <H1>Your work</H1>
        <Body muted>Sign in to see what you have in progress.</Body>
        <View style={{ marginTop: space.xl }}>
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
      </Screen>
    );
  }

  const open = (rows ?? []).filter((e) => OPEN.includes(e.status));
  const done = (rows ?? []).filter((e) => !OPEN.includes(e.status));
  const shown = tab === 'open' ? open : done;

  return (
    <Screen>
      <H1>Your work</H1>

      <Row gap={space.sm} wrap>
        <Chip label={`In progress (${open.length})`} selected={tab === 'open'} onPress={() => setTab('open')} />
        <Chip label={`Finished (${done.length})`} selected={tab === 'done'} onPress={() => setTab('done')} />
      </Row>

      <View style={{ height: space.lg }} />

      {rows === null ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty
          text={tab === 'open' ? 'Nothing in progress.' : 'Nothing finished yet.'}
          action={tab === 'open' ? <Button label="Find someone" onPress={() => router.push('/find')} /> : undefined}
        />
      ) : (
        <View style={{ gap: space.md }}>
          {shown.map((e) => (
            <Card key={e.id} onPress={() => router.push(`/engagement/${e.id}`)}>
              <Row between align="flex-start">
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: C.ink }]}>
                    {(e.engagementType ?? 'engagement').replace(/_/g, ' ')}
                  </Text>
                  <Small>Started {when(e.createdAt)}</Small>
                </View>
                <Text style={[type.bodyStrong, { color: C.ink }]}>{rupees(e.amountPaise)}</Text>
              </Row>
              <Stepper status={e.status} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
