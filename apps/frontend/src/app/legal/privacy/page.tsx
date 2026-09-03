import { AppShell } from '@/components/shell';
import { PageHead, Panel } from '@/components/ui';
import { LegalPlaceholder } from '@/components/legal-placeholder';
import { preview } from '@/lib/preview';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      <PageHead title="Privacy" />
      <LegalPlaceholder>
        <Panel title="What is real about this today">
          <ul className="space-y-2 text-body text-ink-muted">
            <li>Verification documents are never public — a profile shows the conclusion, never the evidence.</li>
            <li>Uploads are private: signed links expire in five minutes and carry the viewer&rsquo;s name.</li>
            <li>We store the last four digits of a card and nothing else — the rest lives with the payment aggregator.</li>
            <li>A phone number or email never crosses a masked thread, in either direction, before an engagement is awarded.</li>
          </ul>
        </Panel>
      </LegalPlaceholder>
    </AppShell>
  );
}
