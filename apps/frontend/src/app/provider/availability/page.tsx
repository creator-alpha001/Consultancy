import { AppShell } from '@/components/shell';
import { Button, Divider, Eyebrow, Field, PageHead, Panel, Select } from '@/components/ui';
import { preview } from '@/lib/preview';
import { requireRole } from '@/lib/session';
import { getAvailability } from '@/lib/data';
import { dateLong } from '@/lib/format';
import {
  addAvailabilityException,
  addAvailabilityRule,
  removeAvailabilityException,
  removeAvailabilityRule,
  setAvailabilityPolicy,
} from '@/app/actions/provider';

export const dynamic = 'force-dynamic';

const DAYS: Array<{ code: string; label: string }> = [
  { code: 'MO', label: 'Monday' },
  { code: 'TU', label: 'Tuesday' },
  { code: 'WE', label: 'Wednesday' },
  { code: 'TH', label: 'Thursday' },
  { code: 'FR', label: 'Friday' },
  { code: 'SA', label: 'Saturday' },
  { code: 'SU', label: 'Sunday' },
];

/** 420 → "07:00". The API stores minutes from midnight; people read clocks. */
function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function daysOf(rrule: string): string {
  const byday = /BYDAY=([A-Z,]+)/.exec(rrule)?.[1] ?? '';
  const codes = byday.split(',').filter(Boolean);
  if (codes.length === 7) return 'Every day';
  return codes.map((c) => DAYS.find((d) => d.code === c)?.label.slice(0, 3) ?? c).join(', ');
}

/**
 * When a provider is free for live work.
 *
 * Weekly rules only, which is what the booking engine actually supports
 * — `FREQ=WEEKLY;BYDAY=…` and nothing else, refused at the boundary
 * rather than partly understood. So this form offers exactly that
 * instead of a recurrence builder whose output the server would reject.
 *
 * A timezone travels with every rule, never an offset. An offset is
 * wrong twice a year and books people an hour out.
 */
export default async function ProviderAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; removed?: string }>;
}): Promise<JSX.Element> {
  await requireRole('provider', '/provider/availability');
  const { fam, lang } = await preview('provider');
  const [{ error, saved, removed }, availability] = await Promise.all([
    searchParams,
    getAvailability(),
  ]);

  const rules = availability?.rules ?? [];
  const policy = availability?.policy;
  const exceptions = availability?.exceptions ?? [];

  return (
    <AppShell fam={fam} lang={lang} role="provider" current="/provider">
      <PageHead
        title="When you are free"
        sub="Only needed for live work. Written work can be booked without any of this."
      />

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </div>
      )}
      {(saved || removed) && (
        <div role="status" className="mb-5 rounded-md border border-verified-line bg-verified-soft px-4 py-3 text-small text-verified">
          {saved ? 'Saved. Those hours are offered from now on.' : 'Removed.'}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Panel title="Weekly hours">
          {rules.length === 0 ? (
            <p className="text-body text-ink-muted">
              No hours offered. Live work cannot be booked with you until there are some.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {rules.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-body font-medium">{daysOf(r.rrule)}</p>
                    <p className="figure mt-0.5 text-small text-ink-muted">
                      {clock(r.startMinute)}–{clock(r.endMinute)} · {r.timezone}
                    </p>
                  </div>
                  <form action={removeAvailabilityRule}>
                    <input type="hidden" name="ruleId" value={r.id} />
                    <Button type="submit" size="sm" tone="destructive">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <Divider className="my-5" />

          <form action={addAvailabilityRule}>
            <Eyebrow>Offer some hours</Eyebrow>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Select
                label="Day"
                name="byday"
                options={DAYS.map((d) => ({ value: d.code, label: d.label }))}
                hint="One day per rule. Add several for a full week."
              />
              <Select
                label="Timezone"
                name="timezone"
                options={[
                  { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
                  { value: 'Asia/Dubai', label: 'Asia/Dubai' },
                  { value: 'Europe/London', label: 'Europe/London' },
                  { value: 'America/New_York', label: 'America/New_York' },
                ]}
                hint="A named zone, never an offset — so daylight saving cannot shift your slots."
              />
              <Field label="From" name="startTime" type="time" required defaultValue="09:00" />
              <Field label="Until" name="endTime" type="time" required defaultValue="17:00" />
            </div>
            <div className="mt-4">
              <Button type="submit">Add these hours</Button>
            </div>
          </form>
        </Panel>

        <aside className="space-y-4">
          {/* Editable here, as on the phone app. They protect the provider's time. */}
          <Panel title="Booking rules" note="Nobody can book inside your notice period, and there is always a gap between sessions.">
            <form action={setAvailabilityPolicy} className="space-y-3">
              <Field label="Shortest notice (minutes)" name="minNoticeMinutes" type="number" inputMode="numeric" required defaultValue={String(policy?.minNoticeMinutes ?? 120)} />
              <Field label="Gap between sessions (minutes)" name="bufferMinutes" type="number" inputMode="numeric" required defaultValue={String(policy?.bufferMinutes ?? 15)} />
              <Field label="Booked up to (days ahead)" name="maxAdvanceDays" type="number" inputMode="numeric" required defaultValue={String(policy?.maxAdvanceDays ?? 60)} />
              <Field label="Slot length (minutes)" name="slotMinutes" type="number" inputMode="numeric" required defaultValue={String(policy?.slotMinutes ?? 60)} />
              <Button type="submit" size="sm">
                Save the rules
              </Button>
            </form>
          </Panel>

          <Panel title="Days off" note="A blocked date overrides your weekly hours. Nobody can book you on it.">
            {exceptions.length === 0 ? (
              <p className="text-small text-ink-muted">None set.</p>
            ) : (
              <ul className="mb-4 divide-y divide-line">
                {exceptions.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-small font-medium">{dateLong(x.onDate)}</p>
                      {x.reason && <p className="text-caption text-ink-muted">{x.reason}</p>}
                    </div>
                    <form action={removeAvailabilityException}>
                      <input type="hidden" name="exceptionId" value={x.id} />
                      <Button type="submit" size="sm" tone="destructive">
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addAvailabilityException} className="mt-3 space-y-3">
              <Field label="Date" name="onDate" type="date" required />
              <Field label="Reason (optional)" name="reason" hint="Only you see this." />
              <Button type="submit" size="sm" tone="secondary">
                Block this date
              </Button>
            </form>
          </Panel>

          <Panel title="A slot is not a promise to be free">
            <p className="text-small text-ink-muted">
              Hours you offer are only when a seeker <em>may</em> book. Anything already booked, and the gaps
              around it, are taken out automatically.
            </p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
