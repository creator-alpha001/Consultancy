import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Divider, Eyebrow, Field, PageHead, Panel, Select } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { t, tl } from '@/lib/pack';
import { listMyRates } from '@/lib/data';
import { money } from '@/lib/format';
import { removeRate, setRate } from '@/app/actions/provider';

export const dynamic = 'force-dynamic';

/**
 * What a provider charges.
 *
 * Prices are listed by what the work IS, never sorted against anyone
 * else's — #15 applies to a provider's own screen as much as to search.
 * Nothing here tells them what "the going rate" is, because a screen
 * that does is a screen that quietly organises a race to the bottom.
 */
export default async function ProviderServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; removed?: string }>;
}): Promise<JSX.Element> {
  await requireRole('provider', '/provider/services');
  const { fam, lang } = await preview('provider');
  const [{ error, saved, removed }, rates] = await Promise.all([searchParams, listMyRates()]);

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead
        title="What you offer"
        sub="A price for each kind of work you take. Nobody can book something that has no price."
      />

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </div>
      )}
      {(saved || removed) && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          {saved ? 'Saved. It is live now.' : 'Removed. Nobody can book it from here on.'}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Your prices" note="Ordered by what the work is. Never against anyone else's.">
          {rates.length === 0 ? (
            <p className="text-body text-ink-muted">
              Nothing priced yet. Until there is, you will not appear as bookable.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {rates.map((r) => {
                const type = fam.engagementTypes.find((e) => e.code === r.engagementType);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-body font-medium">{type ? t(type.label, lang) : r.engagementType}</p>
                      <p className="mt-0.5 text-caption text-ink-muted">
                        {r.durationMinutes ? `${r.durationMinutes} min` : ''}
                        {r.turnaroundHours ? `back within ${r.turnaroundHours} hr` : ''}
                        {!r.durationMinutes && !r.turnaroundHours ? 'No time commitment set' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="figure text-body font-semibold">
                        {money({ amountPaise: Number(r.amountPaise), currency: r.currency })}
                      </span>
                      <form action={removeRate}>
                        <input type="hidden" name="rateId" value={r.id} />
                        <Button type="submit" size="sm" tone="destructive">
                          Remove
                        </Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Divider className="my-5" />

          <form action={setRate}>
            <Eyebrow>Add or change a price</Eyebrow>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Select
                label="Kind of work"
                name="engagementType"
                options={fam.engagementTypes.map((e) => ({ value: e.code, label: t(e.label, lang) }))}
                hint="Setting a price for a kind you already price replaces it."
              />
              <Field label="Price in rupees" name="rupees" type="number" required placeholder="1500" />
              <Field
                label="Time commitment"
                name="commitment"
                type="number"
                placeholder="45"
                hint="Minutes for live work, hours to return async work. Optional."
              />
            </div>
            <div className="mt-4">
              <Button type="submit">Publish this price</Button>
            </div>
          </form>
        </Panel>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <Eyebrow>What we take</Eyebrow>
            <p className="mt-2 text-small text-ink-muted">
              15% on the first two pieces of work with the same person, 12% on the third to fifth, 8% after that. The
              fee falls because we would rather earn less from a relationship that lasts.
            </p>
          </Card>
          <Panel title="Why there is no suggested price">
            <p className="text-small text-ink-muted">
              We do not show you what others charge, and seekers cannot sort by price. Both are the same decision:
              the moment a marketplace makes price the axis, judgement stops being what wins work — and judgement is
              the only thing a {tl(fam.labels.provider, lang)} is actually selling here.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
