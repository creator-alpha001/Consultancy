# This app is superseded — do not extend it

Paused 2026-08-31. **Superseded 2026-09-09 by `apps/app`,** a Flutter client
for both seekers and providers. New native work goes there; see
`docs/PLAN-FLUTTER.md`.

## Why it was paused

The plan put the native app in **Phase 2**, and listed it under Phase 1's
*"deliberately excluded: … mobile app (web-responsive first)"*. It was built
in Phase 1 anyway, and drifted: by the date of the pause it had none of
payment, file upload, the annotation tool, mentor services, packages,
earnings, payout details, availability, training, or the seeker money screen.
Every slice shipped to web widened the gap.

**That drift is the whole reason `apps/app` is shaped the way it is.** The
decision this time was to keep the web app fully functional — a person on a
laptop needs the whole product in a browser — and to put machinery in place so
the two clients cannot quietly diverge again:

- `packages/contract/routes.json`, 148 routes generated from the running API.
- `scripts/parity.mjs`, which reports what each client calls and fails CI when
  a client **stops** calling a route it used to.
- `scripts/sync-tokens.mjs`, which now generates the app's theme and *checks*
  that the web's stylesheet agrees with the same source.

None of that existed while this app was falling behind. Nothing detected it; a
person reading two files did.

## What is here

The app still builds. Nothing was deleted, because deleting it is a business
decision — but it is no longer a target of the token pipeline, and its
`src/theme/generated-tokens.ts` is frozen at the old design system. Do not
regenerate it; it would only repaint an app on its way out.

`docs/PLAN-FLUTTER.md` schedules the deletion for the end of Slice 10, after
`apps/app` has reached and passed this app's coverage — and says explicitly
that it will be confirmed then rather than assumed now.

## If you are here to add a screen

You are in the wrong directory. It goes in `apps/app`.
