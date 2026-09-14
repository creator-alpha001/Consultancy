/**
 * What each readiness step means, and where it is done.
 *
 * The checklist itself is the API's (`/me/readiness`); this is only the
 * wording and the way in, shared by the readiness page and the dashboard.
 */
/** What each step means, and where it is done. */
export const STEPS: Record<string, { title: string; why: string; href?: string; cta?: string }> = {
  email_verified: {
    title: 'Confirm your email address',
    why: 'Payouts, disputes and decisions about your credentials are sent there.',
    href: '/account',
    cta: 'Send the link again',
  },
  profile_complete: {
    title: 'Add your name and a short bio',
    why: 'The first thing a person reads before trusting you with their work.',
    href: '/account',
    cta: 'Edit your profile',
  },
  credential_submitted: {
    title: 'Submit something to be verified',
    why: 'A claim a human can check. Nothing is published until one has.',
    href: '/provider/credentials',
    cta: 'Submit a credential',
  },
  skill_verified_at_tier: {
    title: 'Be verified at the minimum tier',
    why: 'A reviewer decides this. It is per skill — never one badge for the whole person.',
    href: '/provider/standing',
    cta: 'See your standing',
  },
  working_language: {
    title: 'Name the languages you work in',
    why: 'Matching intersects on language. A language you have not named is one you will never be matched for.',
    href: '/provider/languages',
    cta: 'Set your languages',
  },
  service_published: {
    title: 'Publish at least one price',
    why: 'Nobody can book what has no price.',
    href: '/provider/services',
    cta: 'Set your prices',
  },
  training_complete: {
    title: 'Read the required training',
    why: 'How the agenda, the escrow and disputes actually work. Short, and it is what stops most disputes.',
    href: '/provider/training',
    cta: 'Open training',
  },
  availability_set: {
    title: 'Offer some hours',
    why: 'Only needed for live work. Written work can be booked without it.',
    href: '/provider/availability',
    cta: 'Set availability',
  },
  payout_destination: {
    title: 'Add where you get paid',
    why: 'You can work before this. You cannot be paid out.',
    href: '/provider/payout',
    cta: 'Add a bank account',
  },
};
