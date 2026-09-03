'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';

export interface PackageActionState {
  error?: string;
  ok?: boolean;
}

function fail(err: unknown): PackageActionState {
  if (err instanceof ApiError) return { error: err.message };
  throw err;
}

/**
 * Publish a package.
 *
 * The price is the TOTAL, not per session — that is what gets charged,
 * and the per-session figure is derived for display. Asking for both
 * would create two numbers that have to agree.
 */
export async function publishPackageAction(
  _prev: PackageActionState,
  form: FormData,
): Promise<PackageActionState> {
  const title = String(form.get('title') ?? '').trim();
  const engagementType = String(form.get('engagementType') ?? '').trim();
  const sessionCount = Number(form.get('sessionCount') ?? 0);
  const rupees = String(form.get('rupees') ?? '').trim();
  const commitment = String(form.get('commitment') ?? '').trim();

  if (!title) return { error: 'Give the package a name a seeker will understand.' };
  if (!Number.isInteger(sessionCount) || sessionCount < 2) {
    return { error: 'A package is two or more sessions. One session is just a service.' };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(rupees)) {
    return { error: 'Give the total price in rupees, like 4000.' };
  }

  try {
    await apiAsUser('/me/packages', {
      method: 'POST',
      body: JSON.stringify({
        engagementType,
        skillId: String(form.get('skillId') ?? '') || null,
        title,
        sessionCount,
        amountPaise: String(Math.round(Number(rupees) * 100)),
        commitment: commitment ? Number(commitment) : null,
      }),
    });
    revalidatePath('/mentor/services');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function withdrawPackageAction(
  _prev: PackageActionState,
  form: FormData,
): Promise<PackageActionState> {
  const packageId = String(form.get('packageId') ?? '');
  try {
    await apiAsUser(`/me/packages/${packageId}/withdraw`, { method: 'POST' });
    revalidatePath('/mentor/services');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Buy a package.
 *
 * The idempotency key is derived from the package and the buyer, not
 * generated fresh — a double-clicked button must reach the same key and
 * therefore the same single charge. A random key would satisfy the header
 * and defeat the point.
 */
export async function buyPackageAction(
  _prev: PackageActionState,
  form: FormData,
): Promise<PackageActionState> {
  const packageId = String(form.get('packageId') ?? '');
  try {
    await apiAsUser(`/packages/${packageId}/purchase`, {
      method: 'POST',
      idempotencyKey: `package-purchase:${packageId}`,
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/money');
  redirect('/money');
}

/**
 * Use one session from a package.
 *
 * Lands on the agenda, because a drawn session is an ordinary engagement
 * and the next thing to do is agree what it is for.
 */
export async function drawSessionAction(
  _prev: PackageActionState,
  form: FormData,
): Promise<PackageActionState> {
  const purchaseId = String(form.get('purchaseId') ?? '');
  let engagementId: string;
  try {
    const created = await apiAsUser<{ id: string }>(`/engagements/from-package/${purchaseId}`, {
      method: 'POST',
      body: JSON.stringify({
        domainCode: String(form.get('domainCode') ?? ''),
        categoryId: String(form.get('categoryId') ?? ''),
        language: String(form.get('language') ?? 'en'),
      }),
    });
    engagementId = created.id;
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/money');
  revalidatePath('/engagements');
  redirect(`/engagements/${engagementId}/agenda`);
}
