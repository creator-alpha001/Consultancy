import { AppShell } from '@/components/shell';
import { Card, Eyebrow, PageHead, Panel } from '@/components/ui';
import { LegalPlaceholder } from '@/components/legal-placeholder';
import { preview } from '@/lib/preview';

export const dynamic = 'force-dynamic';

export default async function GrievancePage(): Promise<JSX.Element> {
  const { fam, lang } = await preview('seeker');
  return (
    <AppShell fam={fam} lang={lang} role="seeker" current="/">
      <PageHead title="Grievance officer" sub="For a complaint about the platform itself, not about one engagement." />
      <LegalPlaceholder>
        <Card className="p-5">
          <Eyebrow>Not yet appointed</Eyebrow>
          <p className="mt-2 max-w-reading text-body text-ink-muted">
            A named grievance officer, with a published name, email and response window, is a legal requirement for
            a platform at this stage — and has not been appointed yet. This page is the placeholder for that
            contact, not the contact itself.
          </p>
        </Card>
        <Panel title="Until then">
          <p className="text-body text-ink-muted">
            Anything you would raise with a grievance officer — a safety concern, a dispute you feel was handled
            unfairly, anything about the platform rather than one piece of work — can go through{' '}
            <a href="/safety/report" className="text-brand underline underline-offset-2">the report form</a>. It reaches a
            person, not a queue that resolves itself.
          </p>
        </Panel>
      </LegalPlaceholder>
    </AppShell>
  );
}
