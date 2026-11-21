# Neon Auth cutover (no existing production users)

This change replaces the application's Firebase Auth/session bridge and active
Firestore profile/preset UI with managed Neon Auth and authenticated Postgres APIs.
It does not delete the Firebase project, old Firestore data/rules, environment
variables, or existing development accounts. It does not migrate identities by
matching emails. Previously signed-in Firebase visitors must sign in again.

## Environment and provider setup

- `DATABASE_URL`: use the Neon integration's branch-specific connection string.
  `NEON_DATABASE_URL` is a fallback only. When both exist, `DATABASE_URL` wins.
- `NEON_AUTH_BASE_URL`: Auth URL for **the same branch** as the database.
- `NEON_AUTH_COOKIE_SECRET`: server-only signing secret, at least 32 characters.
  The existing `BETTER_AUTH_SECRET` is used if this is unset. Do not expose either
  secret to browser code. Keep the secret stable across instances.
- `BETTER_AUTH_URL`: the app's public origin (not the Neon Auth endpoint).
- `APP_ORIGINS`: extra exact origins the app accepts. Vercel deployment/branch
  origins are also recognized when the corresponding system variables exist.

In Neon, enable Managed Better Auth on the intended branch. Enable email/password
with **email verification required**, configure email delivery, and enable Google
and GitHub only when their provider credentials are configured. Add the exact
production and preview app origins as trusted domains; don't broadly trust every
Vercel customer's preview domain. Configure the session expiry/update policy in
Neon: the old local three-hour JWT policy no longer controls managed sessions.

The SDK dependency overrides pin Better Auth/core/OAuth to 1.7.12, the managed
server version documented by Neon, avoiding the newer patch releases' conflicting
fetch peer. npm/Bun and pnpm both enforce these pins.

The Next.js SDK proxies auth through `/api/auth/*`, with HttpOnly same-origin
cookies. Workspace middleware completes the Neon OAuth/email-verification token
exchange; public pages remain available without runtime auth configuration.
Protected APIs validate the managed session against Neon and require verified
email. They do not accept the old `__Host-aisdk-session` cookie.

Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
Reference: https://neon.com/docs/auth/reference/nextjs-server

## Database preparation

Run against each intended Neon branch **before enabling the new Workspace**:

```sh
npm run platform:migrate --workspace=apps/web
```

Run it in a trusted environment with that branch's database environment already
configured. The command accepts `DATABASE_URL` (preferred) or `NEON_DATABASE_URL`.
The existing migrations create the app tables; `0009_workspace_data.sql` adds
private profiles and prompt presets. It is additive/idempotent and never modifies
Neon's managed `neon_auth` schema. Apply on a preview branch and test first.

Neon owns passwords, login accounts, email verification and sessions. The app
keeps a verified-ID-keyed user projection in `aisdk_pro.user` solely to preserve
existing foreign keys. A conflicting legacy email fails closed instead of
silently linking identities. Do not delete development records without checking
their associated data and taking a backup.

Profile/preset APIs derive the owner from the verified session, reject extra
fields, bind SQL parameters, and enforce size limits. Presets have 100 fixed
per-owner slots enforced by a primary key and DB check, including under races.
No browser-to-database connection or service credential is exposed.

## GitHub repository access is separate from GitHub login

Neon GitHub login identifies the user; it does not automatically grant access to
repositories. Keep the app's repository OAuth credentials if import/deploy needs
them. Set their callback to:

`https://<app-host>/api/connections/github/callback`

Do not point that OAuth application to the old `/api/auth/callback/github` route,
which is no longer a repository callback. Neon login providers use the callback
specified by Neon. Repository tokens remain encrypted server-side and are bound
to the current Neon user. Old Firebase-linked connections are not auto-reused.

## Release acceptance checklist

- Run tests, typechecks, production build, and the Vercel container's clean pnpm
  install/build path. No Firebase SDK should load from active app code.
- Check Vercel Preview reaches READY for the PR head.
- In a fresh browser, `/login` and `/signup` render without background error banners.
- Create a disposable preview account, verify its email, sign in and sign out.
  API access must be denied for unverified, expired and signed-out users.
- Test Google/GitHub callbacks and password-reset email end to end.
- Save/reload profile and presets, then use a second account to check isolation.
- Confirm repository authorization uses its separate signed-state callback.
- Check the actual expiry returned by `/api/platform/session`; never display or
  store a provider/session token in the public Workspace session envelope.

Email delivery, provider credentials, live Neon migration and signed-in browser
flows require the corresponding connected environment; local passing tests alone
are not evidence that those external configurations work. Historical Firestore
payload/rules tests remain as pure fixtures, with no Firebase SDK dependency.
