import { AppShell } from '@/components/shell';
import { PageHead, Panel } from '@/components/ui';
import { LegalPlaceholder } from '@/components/legal-placeholder';
import { preview } from '@/lib/preview';

export const dynamic = 'force-dynamic';

export default async function RecordingPolicyPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      <PageHead title="Recording and consent" />
      <LegalPlaceholder>
        <Panel title="What is real about this today">
          <ul className="space-y-2 text-body text-ink-muted">
            <li>
              <span className="font-medium text-ink">Both of you have to say yes,</span> at the start of every
              session. Agreeing once in a Terms document is not consent and is not treated as such.
            </li>
            <li>
              <span className="font-medium text-ink">Either of you can say no</span> and the session still happens.
              The refusal is logged, and in a dispute it shifts the burden towards whoever declined.
            </li>
            <li>
              <span className="font-medium text-ink">Kept 90 days,</span> then deleted — longer only while a
              dispute is open.
            </li>
            <li>
              <span className="font-medium text-ink">Watch, not download.</span> A recording is streamed with the
              viewer&rsquo;s name across the frame; there is no download control.
            </li>
          </ul>
        </Panel>
      </LegalPlaceholder>
    </AppShell>
  );
}
