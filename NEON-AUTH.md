# Better Auth + Neon PostgreSQL

The platform signs users in with **Google**, **GitHub**, or **email + password** through self-hosted Better Auth. PostgreSQL stores users, OAuth accounts, password hashes, sessions, and workspace data in the `aisdk_pro` schema. GitHub OAuth is also used separately to connect repositories; that flow stores its own `github-repository` account row and does not sign users in.

Required server variables:

- `NEON_DATABASE_URL`
- `BETTER_AUTH_SECRET` (at least 32 characters)
- `BETTER_AUTH_URL` (`http://localhost:3000` locally; `https://www.ai-sdk.pro` in production)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (sign-in + repository connection)
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (verification and password-reset mail)

## Callback URLs to register

Google Cloud Console (OAuth client):

- `https://www.ai-sdk.pro/auth/platform`
- `https://platform.ai-sdk.pro/auth/platform` (if sign-in starts on the platform subdomain)

GitHub OAuth App (Authorization callback URLs):

- `https://www.ai-sdk.pro/api/auth/callback/github` (sign-in)
- `https://www.ai-sdk.pro/api/connections/github/callback` (repository connection)
- `https://platform.ai-sdk.pro/api/auth/callback/github`
- `https://platform.ai-sdk.pro/api/connections/github/callback`

## Email registration

- Passwords are 12–128 characters and stored as Better Auth hashes in `aisdk_pro.account.password`.
- New accounts must verify their email before a session is issued (`requireEmailVerification`), so a working Resend domain is required.
- `RESEND_FROM_EMAIL` must use a domain verified in Resend. Until both Resend variables are set, email sign-up and password reset return 503 and Google/GitHub sign-in still work.
- Password reset links land on `/reset-password`.

## Sessions

Sessions live in the database with a 3-hour idle window (`apps/web/lib/session-policy.ts`). On HTTPS the session cookie is scoped to `ai-sdk.pro`, so `www.ai-sdk.pro` and `platform.ai-sdk.pro` share one sign-in.
