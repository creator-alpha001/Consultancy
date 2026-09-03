import { AppShell } from '@/components/shell';
import { Card, Divider, Eyebrow, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { tl } from '@/lib/pack';

export const dynamic = 'force-dynamic';

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'When does money actually move?', a: 'Only after you and the provider both lock the agenda. Awarding a proposal is not payment — nothing leaves your account until that lock happens.' },
  { q: 'What if the work does not match what I asked for?', a: 'Ask for a revision first — it costs nothing and keeps the money exactly where it is. If that does not resolve it, you can raise a dispute against the specific agenda items that were not met.' },
  { q: 'Can I see the documents behind someone’s verification?', a: 'No — a profile shows the conclusion (tier, what was checked, when) and never the underlying document, for anyone verified on the platform, including you if you become a provider.' },
  { q: 'Is a session recorded automatically?', a: 'Never. Both people are asked at the start of every session and either can decline. The session still happens either way.' },
  { q: 'Why can’t I sort by price?', a: 'Because it turns a market for judgement into a race to undercut, and the person who loses that race is you. Price is shown, but it is never the primary sort.' },
];

export default async function HelpPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      <PageHead title="Help" sub="Common questions, answered the way the product actually works — not a general policy summary." />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Panel title="Questions">
          <dl className="divide-y divide-line">
            {FAQ.map((item) => (
              <div key={item.q} className="py-4 first:pt-0 last:pb-0">
                <dt className="text-body font-semibold">{item.q}</dt>
                <dd className="mt-1.5 text-body text-ink-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>Still stuck</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              For a problem with a specific person or piece of work, use{' '}
              <a href="/safety/report" className="text-brand underline underline-offset-2">the report form</a> — it reaches a
              person.
            </p>
            <Divider className="my-4" />
            <p className="text-small text-ink-muted">
              If what you are carrying is heavier than a support question, {tl(fam.labels.seeker, lang)} or not,
              someone trained for it is worth calling before anything on this site.
            </p>
            <ul className="mt-3 space-y-1.5">
              {fam.helplines.map((h) => (
                <li key={h.number} className="text-small">
                  <span className="text-ink-muted">{h.name}</span>{' '}
                  <span className="figure font-semibold">{h.number}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
