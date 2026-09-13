# Accounts, sign-in and onboarding

How people get into Sankalp, how they get back in, and what a mentor
has to do before anyone can book them. Written 2026-09-14.

`TRACKER.md` is the authority on what works. Where this document and the
tracker disagree, trust the tracker.

---

## The decisions

| Decision | Detail |
|---|---|
| **Email + password** is the only way to sign in | No phone OTP and no Google sign-in. Phone OTP would need CLAUDE.md's "never store a full phone number" rule changed and an SMS vendor with DLT registration; it was not chosen |
| **Amazon SES in Mumbai** sends email | Behind a transport seam; development logs emails instead of sending them |
| **Open mentor signup, verified per skill** | Anyone may register as a mentor. Nobody can be found or booked until a person has verified a credential, and the checklist below is complete |
| **Two-factor for mentors is currently OFF** | A recorded decision (migration 0039) so demo mentors can sign in during evaluation. CLAUDE.md #32 requires it; it **must be switched back on before launch**: `UPDATE mfa_policy SET mandatory = true WHERE role = 'provider';` Admins always need it |

---

## Signing in

| | |
|---|---|
| Register | Name, email, password (12+ characters, not containing the email), role, the family whose terms were shown, and an explicit 18+ confirmation (#27). A confirmation email is sent straight away |
| Sign in | Email + password. An account with an authenticator also needs its six-digit code, or a single-use recovery code |
| Wrong password | One error for "no such account" and "wrong password", so the form cannot reveal who is registered. Five failures lock the account for 15 minutes |
| Two-factor setup | A mentor or admin without a factor gets a 10-minute ticket that can only enrol: scan the QR code (or type the key), confirm a code, and receive recovery codes shown exactly once |
| Sessions | Server-side. Only a SHA-256 of the token is stored. The web keeps it in an httpOnly cookie; the app keeps it in the platform keystore |
| Session length | Seekers and mentors: signed out after **7 days unused**, and after 30 days regardless. Admins: after **30 minutes unused**, and after 12 hours regardless. Defined once, in `SESSION_POLICY` (`identity/session.service.ts`) |
| Devices | See active sessions; sign out everywhere else in one tap |

### Forgot password

1. The person enters their email (web `/forgot-password`, or "Forgot your password?" in the app).
2. The screen always says a link is on its way, whether or not the address has an account.
3. If it does, an email with a link to `/reset-password#token=…` is sent. The link works for **30 minutes**, once. Asking again makes earlier links stop working. At most 3 links an hour per account, and a request over the limit looks exactly like any other.
4. Setting a new password **signs the account out on every device** and clears any lockout. It does not remove a second factor: a reset proves the inbox, not the phone.

The link opens the **web** page on whatever device read the email. The app sends the request but never handles the token.

### Confirming an email address

Sent at registration, and re-sendable from the account page (web `/account`, app **You → Your profile**). The link `/verify-email#token=…` works for **48 hours**. A seeker can use the platform before confirming. A mentor cannot be booked until they have.

### Changing a password

From the account page. Needs the current password, and signs out every other device while keeping this one.

### Why tokens are safe in the database

- **Only a hash is stored.** `account_tokens` keeps a SHA-256 of each token and nothing else.
- **The link is derived when the email is sent**, as HMAC(`ACCOUNT_TOKEN_SECRET`, purpose:rowId). So the working link never sits in the outbox, the tokens table or a log: a database dump alone cannot reset anyone's password.
- **The token rides in the URL fragment** (`#token=`), which browsers never send to a server. It stays out of access logs and Referer headers.
- **Triggers enforce single use.** A token is spent exactly once, and its hash and expiry cannot be rewritten.

---

## Onboarding a seeker

1. Register, which sends the confirmation email.
2. Home shows **"What are you preparing for?"** until they pick at least one field.
3. **Your fields** (web `/account#fields`, app **You → Your fields**) lists every open field. For each one they choose the language they work in there, from that field's own list (#19). They can add several (#6) and mark one as main.

Fields they never declared but have work in are still shown, inferred from their engagements.

---

## Onboarding a mentor

### The readiness checklist

`GET /me/readiness` is the single source of truth; neither client decides what "ready" means. Nothing is assumed about which field a mentor is in. Their families come from where they signed up, the credentials they submitted, and the skills they are verified in.

| Step | Blocks booking? | Done when | Where |
|---|---|---|---|
| `email_verified` | Yes | The confirmation link was opened | Account / profile |
| `profile_complete` | Yes | A name and a bio are saved | Account / profile |
| `credential_submitted` | Yes | A credential is submitted (pending counts) | Verification / credentials |
| `skill_verified_at_tier` | Yes | A skill is verified at the family's minimum tier | Verification standing |
| `working_language` | Yes | At least one language they can assess in | Working languages |
| `service_published` | Yes | At least one published price | What you offer |
| `training_complete` | Yes | The training of **every** family they are in is passed | Training |
| `availability_set` | No | Weekly hours are set (live work only) | Availability |
| `payout_destination` | No | A payout account is on file | Payout |

`bookable` is true only when every blocking step is done and the mentor isn't blocked from paid work (for example, a serving officer without sanction).

### The profile

- **Name, headline and bio**, where the bio is kept with the language it was written in.
- **No photo.** Uploads are private by rule #29; a public photo needs its own decision.
- **No contact details.** Phone numbers and email addresses in a headline or bio are refused, because they route people around escrow and the dispute process.

### Verification

1. The mentor submits a credential: its type, the typed details, and optionally a document.
2. An admin opens it at web **Admin → Verification**.
3. The admin runs the automated check. It only sorts the queue and can never verify anyone.
4. The admin opens the document. This grants that admin access, is logged, and the link lasts five minutes.
5. The admin verifies, or refuses with a reason.
6. Verifying grants the tier the credential type carries, for the skills it covers, and nothing more.
7. The mentor is **emailed the decision**, including the reason on a refusal, in their chosen language.

---

## Email

| Email | Sent when | Link |
|---|---|---|
| Reset your password | Forgot-password request | `/reset-password#token=…` (30 min) |
| Confirm your email | Registration, or "send again" | `/verify-email#token=…` (48 h) |
| Credential verified / not verified | An admin decides | `/provider/readiness` |

**How sending works.** An email is written to the outbox in the same transaction as the event (CLAUDE.md #9). The outbox relay then composes it at send time and sends it through the configured transport. If a link was superseded, used or expired while waiting, it is not sent.

**Languages.** Templates live in `notifications/email/catalogue.ts`, in English and Hindi, chosen by the person's language setting.

### Setting up Amazon SES

1. In SES (region `ap-south-1`), verify the sending domain, and add its DKIM records to DNS.
2. Request production access. Until then, SES only delivers to verified addresses.
3. Create an IAM user or role allowed `ses:SendEmail`, and expose its credentials to the API through the usual AWS variables or an instance role.
4. Set:

   ```bash
   EMAIL_TRANSPORT=ses
   EMAIL_FROM="Sankalp <no-reply@your-domain>"
   ACCOUNT_TOKEN_SECRET=<32+ random characters>
   PUBLIC_WEB_URL=https://your-web-address
   OUTBOX_RELAY_INTERVAL_MS=15000
   ```

5. Run `npm run migrate` in `apps/api`, which applies 0054.

**In development**, leave `EMAIL_TRANSPORT` unset. Each email is printed to the API console, with the link, so the whole flow can be clicked through locally. In production the logging transport never prints a link.

---

## API routes

| Route | Who | Purpose |
|---|---|---|
| `POST /auth/register` | Public | Now also takes `displayName` |
| `POST /auth/password/forgot` | Public | Always 202 |
| `POST /auth/password/reset` | Public | `{ token, password }` |
| `POST /auth/password/change` | Signed in | `{ currentPassword, newPassword }` |
| `POST /auth/email/verify` | Public | `{ token }` |
| `POST /auth/email/resend` | Signed in | 409 if already confirmed, 429 over the limit |
| `GET/POST /me/profile` | Signed in | Name, language; headline and bio for mentors |
| `POST /me/domains`, `POST /me/domains/:code/remove` | Seeker | Declare or remove a field |
| `GET /me/readiness` | Mentor | Now also returns `families`; no default field |
| `GET /me/training?family=` | Mentor | 422 `FAMILY_REQUIRED` when it cannot tell which family |

---

## Known limits

| | |
|---|---|
| **Two-factor for mentors is off** | See the decisions above. Switch it on before launch |
| **Two-factor secrets: key custody is ops' job** | Secrets are now encrypted at rest (AES-256-GCM, `MFA_ENCRYPTION_KEY`, required in production). Where the key is kept and how often it is rotated is an operational decision |
| **No breach-list password check** | TRACKER D21 |
| **SES never exercised for real** | No AWS account here. The transport is written against the SDK and tested with a logging transport |
| **No push, SMS or WhatsApp** | Only email exists (D28) |
| **No account deletion or data export** | A retention and legal decision, not yet made |
| **Web shell still has a preview role switcher** | The header's sample badges and initials are gone; the "switch product" menu from the preview build remains |
