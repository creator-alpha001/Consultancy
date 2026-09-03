import { AppShell } from '@/components/shell';
import { PageHead, Panel } from '@/components/ui';
import { LegalPlaceholder } from '@/components/legal-placeholder';
import { preview } from '@/lib/preview';

export const dynamic = 'force-dynamic';

export default async function TermsPage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      <PageHead title="Terms of service" />
      <LegalPlaceholder>
        <Panel title="What is real about this today">
          <ul className="space-y-2 text-body text-ink-muted">
            <li>Money moves only into escrow, held by a licensed payment aggregator — never by Sankalp directly.</li>
            <li>A locked agenda is immutable; a change goes through a change order both sides accept.</li>
            <li>Recording requires an explicit yes from both people at the start of every session.</li>
            <li>Disputes are ruled by a person, citing the specific agenda items claimed.</li>
          </ul>
        </Panel>
      </LegalPlaceholder>
    </AppShell>
  );
}
