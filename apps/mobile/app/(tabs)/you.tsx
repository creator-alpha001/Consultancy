import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Chip, ErrorNote, H1, Row, Screen, Section, Small } from '@/components/kit';
import { ApiError, api } from '@/lib/api';
import { languageName } from '@/lib/pack';
import { useStore, useWords } from '@/lib/store';
import { LIGHT as C, TOUCH, space, type } from '@/theme/tokens';

interface WorkingLanguage {
  langCode: string;
  canEvaluate: boolean;
}

/**
 * The languages a provider works in — NOT the app's language.
 *
 * Two different things that the word "language" hides. The section above
 * this one picks what the interface renders in, which is a display
 * choice; this one is a claim about what work someone can take on, and
 * it decides who they are matched to (#19).
 *
 * `canEvaluate` separates speaking a language from being able to mark
 * written work in it. Someone may be fluent in Marathi conversation and
 * still be the wrong person for a Marathi answer script — and being
 * handed work you cannot read is worse for both sides than not being
 * matched at all.
 */
function WorkingLanguages(): JSX.Element {
  const { domain, lang } = useStore();
  const [offerable, setOfferable] = useState<string[]>([]);
  const [mine, setMine] = useState<WorkingLanguage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!domain) return;
    try {
      const [opts, current] = await Promise.all([
        api<{ languages: string[] }>(`/domains/${domain.domainCode}/working-languages`, { anonymous: true }),
        api<WorkingLanguage[]>('/me/languages'),
      ]);
      setOfferable(opts.languages);
      setMine(current);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not load your languages.' },
      );
      setMine([]);
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: WorkingLanguage[]): Promise<void> {
    if (!domain) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api<WorkingLanguage[]>('/me/languages', {
        method: 'POST',
        body: { domainCode: domain.domainCode, languages: next },
      });
      setMine(res);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'Could not save your languages.' },
      );
    } finally {
      setBusy(false);
    }
  }

  if (mine === null) return <Section title="Languages you work in"><Small>Loading…</Small></Section>;

  const selected = new Map(mine.map((l) => [l.langCode, l]));

  return (
    <Section title="Languages you work in">
      <ErrorNote error={error} />
      <Small>
        This is what you can be matched for — separate from the app's language above. Leave a language off
        rather than claiming it: someone will be handed work in it.
      </Small>
      <View style={{ height: space.md }} />

      <Card style={{ paddingVertical: 0, paddingHorizontal: 0 }}>
        {offerable.map((code, i) => {
          const chosen = selected.get(code);
          return (
            <View
              key={code}
              style={{
                paddingVertical: space.md,
                paddingHorizontal: space.lg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: C.rule,
              }}
            >
              <Pressable
                onPress={() => {
                  const next = chosen
                    ? mine.filter((l) => l.langCode !== code)
                    : [...mine, { langCode: code, canEvaluate: true }];
                  void save(next);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: chosen !== undefined }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    backgroundColor: chosen ? C.accent : 'transparent',
                    borderWidth: chosen ? 0 : 1,
                    borderColor: C.rule,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {chosen && <Text style={{ color: '#fff', fontSize: 13 }}>✓</Text>}
                </View>
                <Text style={[type.body, { color: C.ink, flex: 1 }]}>{languageName(code, lang)}</Text>
              </Pressable>

              {chosen && (
                <Pressable
                  onPress={() =>
                    void save(
                      mine.map((l) => (l.langCode === code ? { ...l, canEvaluate: !l.canEvaluate } : l)),
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: chosen.canEvaluate }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH, marginLeft: 36 }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      backgroundColor: chosen.canEvaluate ? C.accent : 'transparent',
                      borderWidth: chosen.canEvaluate ? 0 : 1,
                      borderColor: C.rule,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {chosen.canEvaluate && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
                  </View>
                  <Text style={[type.small, { color: C.inkMuted, flex: 1 }]}>
                    I can assess written work in {languageName(code, lang)}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </Card>

      {busy && <Small>Saving…</Small>}
      {saved && !busy && <Small>Saved.</Small>}
      {mine.length === 0 && !busy && (
        <>
          <View style={{ height: space.sm }} />
          <Small>
            With none set you will not appear in any search. Pick at least the languages you actually work in.
          </Small>
        </>
      )}
    </Section>
  );
}

export default function You(): JSX.Element {
  const router = useRouter();
  const { me, domain, lang, setLang, signOut } = useStore();
  const words = useWords();

  if (!me) {
    return (
      <Screen>
        <H1>You</H1>
        <Body muted>Sign in to book, agree goals, and track your work.</Body>
        <View style={{ marginTop: space.xl, gap: space.md }}>
          <Button label="Create an account" onPress={() => router.push('/register')} />
          <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>You</H1>

      <Card>
        <Row gap={space.md}>
          <Avatar name={me.email} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.bodyStrong, { color: C.ink }]}>{me.email}</Text>
            <Small>{me.role === 'provider' ? words.provider : words.seeker}</Small>
          </View>
        </Row>
      </Card>

      <View style={{ height: space.xl }} />

      {/*
        Progress lives here rather than in a sixth tab: five is already
        the limit on a small phone, and a personal record is what someone
        looks for under their own account. Seeker-only — a mentor's
        progress is not a thing this platform measures.
      */}
      {me.role === 'seeker' && (
        <Section title="Your own record">
          <Card>
            <Body>
              How your marks have moved, and what your reviewers asked you to work on.
            </Body>
            <View style={{ height: space.md }} />
            <Button label="Open your progress" variant="secondary" onPress={() => router.push('/progress')} />
          </Card>
        </Section>
      )}

      <Section title="App language">
        <Row gap={space.sm} wrap>
          {(domain?.languages ?? ['en']).map((l) => (
            <Chip key={l} label={languageName(l, lang)} selected={l === lang} onPress={() => setLang(l)} />
          ))}
        </Row>
        <View style={{ height: space.sm }} />
        <Small>What this app renders in. It does not change who you are matched with.</Small>
      </Section>

      {me.role === 'provider' && <WorkingLanguages />}

      {domain?.supportResources && domain.supportResources.length > 0 && (
        <Section title="If you need to talk to someone">
          <View style={{ gap: space.sm }}>
            {domain.supportResources.map((r) => (
              <Card key={r.value}>
                <Text style={[type.bodyStrong, { color: C.ink }]}>{r.value}</Text>
                <Small>{r.label}</Small>
              </Card>
            ))}
          </View>
        </Section>
      )}

      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
