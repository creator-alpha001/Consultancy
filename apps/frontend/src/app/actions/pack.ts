'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireRole } from '@/lib/session';
import { getDomainManifest, type ManifestCategory } from '@/lib/data';
import { invalidatePack } from '@/lib/pack';

/**
 * Publishing a domain's category tree.
 *
 * There is no "edit one category" endpoint and this does not pretend
 * otherwise: a manifest is published whole. That turns out to be safe
 * rather than alarming, because of how the sync behaves —
 *
 *  - categories are matched **by slug**, so a category keeps its id
 *    across a publish and every engagement, board post and evaluation
 *    already pointing at it stays pointing at it;
 *  - a category the new manifest omits is **deactivated, not deleted**,
 *    so nothing referencing it breaks.
 *
 * What the whole-document model does risk is a person retiring something
 * without meaning to, so the screen shows the diff and this action
 * refuses a publish whose retirements were not acknowledged.
 */

/** Every slug in a tree, so two versions can be compared. */
function slugsOf(categories: ManifestCategory[], prefix = ''): string[] {
  return categories.flatMap((c) => {
    const path = prefix ? `${prefix}/${c.slug}` : c.slug;
    return [path, ...slugsOf(c.children ?? [], path)];
  });
}

/**
 * The next patch version.
 *
 * `domain_manifest_versions` keys on (domain, version) and does nothing
 * on conflict, so republishing under the same version would change the
 * live manifest while recording no history of it. Bumping here is what
 * makes "who changed the platform, and when" answerable — the audit row
 * alone names the publisher but not the content.
 */
function nextVersion(current: string): string {
  const parts = current.split('.');
  const patch = Number(parts[2] ?? '0');
  if (parts.length < 3 || !Number.isFinite(patch)) return `${current}.1`;
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

export interface PublishOutcome {
  ok: boolean;
  message: string;
  retired?: string[];
}

export async function publishCategories(formData: FormData): Promise<void> {
  const code = String(formData.get('domainCode') ?? '');
  await requireRole('admin', `/admin/config/domains/${code}`);

  const raw = String(formData.get('categories') ?? '[]');
  const acknowledged = formData.get('acknowledgeRetirements') === 'on';

  let categories: ManifestCategory[];
  try {
    categories = JSON.parse(raw) as ManifestCategory[];
  } catch {
    redirect(`/admin/config/domains/${code}?error=${encodeURIComponent('The edit could not be read. Nothing was published.')}`);
  }

  const current = await getDomainManifest(code);
  if (!current) {
    redirect(`/admin/config/domains/${code}?error=${encodeURIComponent('That domain no longer exists.')}`);
  }

  const before = new Set(slugsOf(current.categories));
  const after = new Set(slugsOf(categories));
  const retired = [...before].filter((s) => !after.has(s));

  if (retired.length > 0 && !acknowledged) {
    redirect(
      `/admin/config/domains/${code}?error=${encodeURIComponent(
        `${retired.length} categor${retired.length === 1 ? 'y' : 'ies'} would be retired. Tick the box to confirm you meant to.`,
      )}`,
    );
  }

  if (categories.length === 0) {
    redirect(
      `/admin/config/domains/${code}?error=${encodeURIComponent(
        'A domain with no categories can be matched against by nobody. Refusing to publish an empty tree.',
      )}`,
    );
  }

  const manifest = { ...current, version: nextVersion(current.version), categories };

  try {
    await apiAsUser('/admin/domains/manifest', {
      method: 'POST',
      body: JSON.stringify(manifest),
      // Publishing twice from a double-clicked button must not record
      // two versions (#10).
      idempotencyKey: `pack:${code}:${manifest.version}`,
    });
  } catch (err) {
    const detail =
      err instanceof ApiError
        ? ((err.detail?.issues as string[] | undefined)?.join('; ') ?? err.message)
        : 'Publishing failed.';
    redirect(`/admin/config/domains/${code}?error=${encodeURIComponent(detail)}`);
  }

  /*
   * The catalogue, the search filters and every screen that names a
   * category all read the pack. This is the "no deploy" claim actually
   * happening, so the caches that would hide it are dropped — both
   * Next's route cache and this app's own pack cache, which otherwise
   * holds the old labels for up to a minute and makes a successful
   * publish look like a failed one.
   */
  invalidatePack();
  revalidatePath('/admin/config');
  revalidatePath(`/admin/config/domains/${code}`);
  revalidatePath('/fields');
  revalidatePath('/providers');

  redirect(`/admin/config/domains/${code}?published=${encodeURIComponent(manifest.version)}`);
}

/**
 * Open or close a domain to the public.
 *
 * The supply floor is reported by the API, never enforced by it — a
 * domain can be opened below its floor, deliberately, because readiness
 * also depends on whether its category tree has been checked against a
 * current official source, which no query knows. The audit entry records
 * the number it was opened at.
 */
export async function setDomainListing(formData: FormData): Promise<void> {
  await requireRole('admin', '/admin/config');
  const code = String(formData.get('domainCode') ?? '');
  const publiclyListed = formData.get('publiclyListed') === 'true';

  try {
    await apiAsUser(`/admin/catalogue/${encodeURIComponent(code)}/listing`, {
      method: 'POST',
      body: JSON.stringify({ publiclyListed }),
    });
  } catch (err) {
    const detail = err instanceof ApiError ? err.message : 'That did not go through.';
    redirect(`/admin/config?error=${encodeURIComponent(detail)}`);
  }

  // Opening a domain changes what every visitor can browse.
  invalidatePack();
  revalidatePath('/admin/config');
  revalidatePath('/fields');
  revalidatePath('/providers');
  redirect(`/admin/config?listing=${encodeURIComponent(publiclyListed ? 'opened' : 'closed')}`);
}
