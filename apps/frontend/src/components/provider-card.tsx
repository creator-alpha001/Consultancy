import Link from 'next/link';
import type { ProviderSummary } from '@/lib/types';
import type { FamilyPack, Lang } from '@/lib/pack';
import { t } from '@/lib/pack';
import { money } from '@/lib/format';
import { Avatar, Chip, LanguageChip, Rating, TierChip } from './ui';

/**
 * A provider in a list.
 *
 * What is on it is a deliberate answer to the seeker's real fear — "I'll
 * pay and get generic advice I could have Googled." So: the verified
 * skill and its tier, the working language, the response time, the
 * price floor. What is *not* on it: any comparison against another
 * provider, and any sort-by-price affordance.
 */
export function ProviderCard({
  provider,
  fam,
  lang = 'en',
}: {
  provider: ProviderSummary;
  fam: FamilyPack;
  lang?: Lang;
}): JSX.Element {
  const top = provider.verifiedSkills[0];
  return (
    <li>
      <Link
        href={`/providers/${provider.id}`}
        className="group block rounded-lg border border-line bg-surface p-5 shadow-e1 transition-shadow hover:shadow-e2"
      >
        <div className="flex gap-4">
          <Avatar name={provider.displayName} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-lead font-semibold group-hover:text-brand">{provider.displayName}</h3>
              <Rating value={provider.rating.mean} count={provider.rating.count} />
              {provider.isNew && <Chip tone="info">New here</Chip>}
            </div>
            <p className="mt-1.5 line-clamp-2 text-body text-ink-muted">{provider.headline.original}</p>

            {/*
              Tier is shown attached to the skill it was granted for.
              A bare "T4" badge next to a name would be a lie by omission
              — the tier means nothing without the skill.
            */}
            {top && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip tone="brand">{top.skillLabelKey}</Chip>
                <TierChip tierLabel={t(fam.tierLabels[top.tier], lang)} />
                {provider.verifiedSkills.length > 1 && (
                  <span className="text-caption text-ink-muted">
                    +{provider.verifiedSkills.length - 1} more verified
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
          <Fact label="From" value={<span className="figure">{money(provider.fromPrice)}</span>} />
          <Fact
            label="Replies in"
            value={
              provider.responseMedianMinutes === null ? (
                <span className="text-ink-muted">No history yet</span>
              ) : (
                <span className="figure">
                  {provider.responseMedianMinutes < 60
                    ? `${provider.responseMedianMinutes} min`
                    : `${Math.round(provider.responseMedianMinutes / 60)} hr`}
                </span>
              )
            }
          />
          <Fact
            label="Completes"
            value={
              provider.completionRate === null ? (
                <span className="text-ink-muted">—</span>
              ) : (
                <span className="figure">{Math.round(provider.completionRate * 100)}%</span>
              )
            }
          />
          <div>
            <dt className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">Works in</dt>
            <dd className="mt-1">
              <LanguageChip languages={provider.languages} />
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div>
      <dt className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-small font-medium">{value}</dd>
    </div>
  );
}
