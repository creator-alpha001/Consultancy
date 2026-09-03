# This app is paused — do not extend it

Decided 2026-08-31. **New work goes to `apps/web`.**

## Why

The plan puts the native app in **Phase 2**, and lists it under Phase 1's
*"deliberately excluded: … mobile app (web-responsive first)"*. It was
built in Phase 1 anyway, and drifted: by the date of this note it had
none of payment, file upload, the annotation tool, mentor services,
packages, earnings, payout details, availability, training, or the seeker
money screen. Every slice shipped to web widened the gap.

Two half-finished clients is the worst of the available options. One
finished responsive web app reaches every handset with no install step,
no Play Store between a search result and a booking, and keeps provider
profiles indexable — which the plan calls a major free acquisition
channel.

## What is here

The app still builds and still runs; nothing was deleted, because
resuming is a business decision and deleting would make it expensive.
Two screens were added on the day of the pause — the payment step and
progress — because the engagement screen said *"fund escrow to start"*
and offered no way to do so. That was a dead end, not a missing feature.

## Before resuming

Read `TRACKER.md` → *Decisions and deviations from spec* first, and ask
whether responsive web has made this unnecessary. `apps/web` now passes
`test/mobile-fit.mjs` — every screen at 360px with thumb-sized targets —
alongside the 3G budget in `test/hardening.mjs`.

If you do resume it, the gap is roughly the size of build slices 3–6
again. Plan it as its own piece of work rather than extending it one
screen at a time, which is how it got here.
