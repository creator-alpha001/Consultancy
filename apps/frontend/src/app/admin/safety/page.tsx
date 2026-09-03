import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, PageHead, Panel, SlaClock } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { listSafetyQueue } from '@/lib/data';
import { ago, until } from '@/lib/format';

export const dynamic = 'force-dynamic';

const KIND: Record<string, { label: string; tone: 'danger' | 'caution' | 'neutral' }> = {
  distress: { label: 'Distress', tone: 'danger' },
  contact_leak: { label: 'Off-platform contact', tone: 'caution' },
  abuse: { label: 'Abuse', tone: 'danger' },
  impersonation: { label: 'Impersonation', tone: 'caution' },
};

/**
 * Safety, with distress as a separate queue.
 *
 * This is the screen the whole duty-of-care section exists for.
 *
 * Competitive-exam preparation means years of isolation and repeated
 * failure in a population with a documented mental-health crisis. A
 * person who writes something frightening into a request box is not a
 * moderation ticket, and the product must not treat them as one:
 *
 *  - their content is HELD from public view, not published and not
 *    deleted
 *  - they never see the word "rejected"; they see an acknowledgement and
 *    the family pack's real helpline numbers
 *  - it goes to a queue with a one-hour target, not the general one
 *  - the response is drafted for the reviewer, so nobody is composing
 *    something this delicate from scratch under time pressure
 */
export default async function SafetyQueuePage(): Promise<JSX.Element> {
  await requireRole('admin', '/admin/safety');
  const { fam, lang } = await preview('admin');
  const items = await listSafetyQueue();
  const distress = items.filter((i) => i.kind === 'distress');
  const other = items.filter((i) => i.kind !== 'distress');

  return (
    <AppShell fam={fam} lang={lang} role="admin" current="/admin/safety">
      <PageHead title="Safety" sub="Distress is a separate queue with a one-hour target and trained reviewers only." />

      {distress.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-heading font-semibold">Distress</h2>
          <ul className="grid gap-3">
            {distress.map((item) => (
              <li key={item.id}>
                <Card className="border-danger-line p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone="danger">Distress</Chip>
                        <Chip tone="neutral">{item.source}</Chip>
                        {item.heldFromPublic && <Chip tone="caution">Held from public view</Chip>}
                      </div>
                      <blockquote className="mt-3 border-l-2 border-danger-line pl-3 text-body">
                        {item.excerpt}
                      </blockquote>
                      <p className="mt-2 text-small text-ink-muted">Flagged {ago(item.openedAt)}</p>
                    </div>
                    <SlaClock text={until(item.slaDueAt)} />
                  </div>

                  <div className="mt-4 rounded-md border border-line bg-surface-sunk p-4">
                    <Eyebrow>Drafted reply — read it before you send it</Eyebrow>
                    <p className="mt-2 text-body">
                      &ldquo;Thank you for writing this. We have kept your post private for now — not because there is
                      anything wrong with it, but because we would rather talk to you than publish it.
                      <br />
                      <br />
                      If you want to speak to someone today, these people are trained for exactly this and are free:
                      <br />
                      {fam.helplines.map((h) => (
                        <span key={h.number} className="block">
                          {h.name} — <span className="figure font-semibold">{h.number}</span> ({h.hours})
                        </span>
                      ))}
                      <br />
                      Your account is untouched and nothing has been removed. If you would like the post to go up as
                      written, reply and we will put it up.&rdquo;
                    </p>
                    <p className="mt-3 text-caption text-ink-muted">
                      Never the word &ldquo;rejected&rdquo;, never a policy citation, never a warning. If you are
                      editing this into something firmer, stop and escalate instead.
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button>Send and keep held</Button>
                    <Button tone="secondary">Send and publish as written</Button>
                    <Button tone="secondary">Escalate to the on-call lead</Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h2 className="mb-3 text-heading font-semibold">Everything else</h2>
          <ul className="grid gap-3">
            {other.map((item) => {
              const k = KIND[item.kind] ?? { label: item.kind, tone: 'neutral' as const };
              return (
                <li key={item.id}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone={k.tone}>{k.label}</Chip>
                          <Chip tone="neutral">{item.source}</Chip>
                        </div>
                        <blockquote className="mt-2.5 border-l-2 border-line pl-3 text-body text-ink-muted">
                          {item.excerpt}
                        </blockquote>
                        <p className="mt-2 text-small text-ink-muted">Reported {ago(item.openedAt)}</p>
                      </div>
                      <SlaClock text={until(item.slaDueAt)} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3.5">
                      <Button size="sm">Warn</Button>
                      <Button size="sm" tone="secondary">
                        No action
                      </Button>
                      <Button size="sm" tone="destructive">
                        Suspend pending review
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="space-y-4">
          <Panel title="Contact masking">
            <p className="text-small text-ink-muted">
              Numbers written as words, in images, or as &ldquo;the green app&rdquo; are caught the same way a plain
              number is. First time is a warning, not a penalty — most people are not trying to evade anything.
            </p>
            <Divider className="my-4" />
            <p className="text-small text-ink-muted">
              Masking alone always fails eventually. The real defence is that our fee falls the longer two people work
              together, so leaving stops being worth the trouble.
            </p>
          </Panel>

          <Panel tone="danger" title="Standing rules">
            <ul className="space-y-2 text-small">
              <li>Distress content is never deleted and never published without asking.</li>
              <li>Anything involving someone under 18 stops and escalates immediately.</li>
              <li>Evidence is preserved past normal retention the moment a report is filed.</li>
              <li>An assistant flags. A trained person reads. Nothing here is automatic.</li>
            </ul>
          </Panel>
        </aside>
      </section>
    </AppShell>
  );
}
