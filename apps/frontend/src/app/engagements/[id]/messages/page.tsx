import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Avatar, ButtonLink, Divider, PageHead, Panel, TextArea } from '@/components/ui';
import { preview, contextFor } from '@/lib/preview';
import { tl } from '@/lib/pack';
import { getEngagement } from '@/lib/data';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The masked thread.
 *
 * There is no field on the message record for a phone number or an
 * email address to survive in — the masking is why the thread exists at
 * all rather than a stated policy layered on top of a plain chat.
 */
export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const { lang } = await preview('seeker');
  const e = await getEngagement(id);
  if (!e) notFound();
  const fam = contextFor(e.family);

  /*
   * The thread itself is not part of the mock seam — no message content
   * exists to read back, only the unread count already on the
   * engagement. This screen still has to be real about what it can show:
   * the masking rule, who the other side is, and a composer, rather
   * than fabricated message bodies.
   */
  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/engagements">
      <PageHead
        eyebrow={<span className="figure">{e.reference}</span>}
        title={`Messages with ${e.provider?.displayName ?? '—'}`}
        sub="Kept as evidence. Phone numbers and email addresses are masked in both directions until the work is awarded."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Panel title="Thread">
          {e.unreadMessages > 0 ? (
            <div className="flex items-start gap-3 rounded-md bg-surface-sunk p-4">
              <Avatar name={e.provider?.displayName ?? '—'} size="sm" />
              <div className="min-w-0">
                <p className="text-small font-medium">{e.provider?.displayName}</p>
                <p className="mt-1 text-body">
                  {e.unreadMessages} unread {e.unreadMessages === 1 ? 'message' : 'messages'}.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-body text-ink-muted">Nothing yet. Anything sent here stays as part of the record.</p>
          )}

          <Divider className="my-5" />

          <TextArea label="Write something" name="message" rows={4} placeholder="A message, an update, a question." />
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/engagements/${e.id}/messages`}>Send</ButtonLink>
          </div>
        </Panel>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel title="What is masked">
            <ul className="space-y-2 text-small text-ink-muted">
              <li>Phone numbers, in either direction.</li>
              <li>Email addresses, in either direction.</li>
              <li>Any pasted link to an off-platform messaging app.</li>
            </ul>
            <Divider className="my-4" />
            <p className="text-caption text-ink-muted">
              Off-platform, the escrow, the {tl(fam.labels.agenda, lang)} and the dispute cover all disappear — and
              it is you who loses them, not us.
            </p>
          </Panel>
          <Panel title="On record since">
            <p className="figure text-body font-medium">{dateTime(e.createdAt)}</p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
