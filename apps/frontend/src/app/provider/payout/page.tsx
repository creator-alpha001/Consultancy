import { AppShell } from '@/components/shell';
import { Button, Chip, Field, PageHead, Panel } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { getPayoutDestination } from '@/lib/data';
import { setPayoutDestination } from '@/app/actions/provider';
import { dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Where a provider is paid — the web twin of the phone app's payout screen.
 *
 * The account number is typed once and passed to the payment aggregator.
 * What comes back, and all that is ever shown, is the last four digits and
 * the IFSC (#31). There is deliberately no way to see the full number again.
 */
export default async function ProviderPayoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}): Promise<JSX.Element> {
  await requireRole('provider', '/provider/payout');
  const { fam, lang } = await preview('provider');
  const { error, saved } = await searchParams;
  const destination = await getPayoutDestination();

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider/earnings">
      <PageHead title="Where you get paid" sub="You can work before adding this. You cannot be paid out without it." />

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </div>
      )}
      {saved && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          Saved. The account is checked before the first payout goes to it.
        </div>
      )}

      <div className="grid max-w-3xl gap-5">
        {destination && (
          <Panel
            title="Current account"
            action={<Chip tone={destination.verifiedAt ? 'verified' : 'caution'}>{destination.verifiedAt ? 'Verified' : 'Being checked'}</Chip>}
          >
            <dl className="grid gap-3 text-small sm:grid-cols-3">
              <div>
                <dt className="text-ink-muted">Account holder</dt>
                <dd className="mt-0.5 font-medium">{destination.accountHolderName}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Account</dt>
                <dd className="figure mt-0.5 font-medium">•••• {destination.bankAccountLast4}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">IFSC</dt>
                <dd className="figure mt-0.5 font-medium">{destination.bankIfsc}</dd>
              </div>
            </dl>
            <p className="mt-3 text-caption text-ink-muted">
              {destination.verifiedAt ? `Checked ${dateLong(destination.verifiedAt)}.` : 'Not checked yet.'}
            </p>
          </Panel>
        )}

        <Panel
          title={destination ? 'Change the account' : 'Add a bank account'}
          note="Only the last four digits and the IFSC are kept. The full number goes to the licensed payment aggregator and is never shown again."
        >
          <form action={setPayoutDestination} className="space-y-4">
            <Field label="Name on the account" name="accountHolderName" required autoComplete="name" />
            <Field label="Account number" name="accountNumber" required inputMode="numeric" autoComplete="off" />
            <Field label="IFSC" name="ifsc" required autoComplete="off" hint="11 characters, like HDFC0001234. It is on your cheque book or passbook." />
            <Button type="submit">{destination ? 'Replace the account' : 'Save the account'}</Button>
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
