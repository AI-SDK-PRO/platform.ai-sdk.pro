# Better Auth + Neon PostgreSQL

The platform signs users in with Google through self-hosted Better Auth. PostgreSQL stores users, OAuth accounts, sessions, and workspace data in the `aisdk_pro` schema. GitHub OAuth is separate and is used only for repository access.

Required server variables:

- `NEON_DATABASE_URL`
- `BETTER_AUTH_SECRET` (at least 32 characters)
- `BETTER_AUTH_URL` (`http://localhost:3000` locally; `https://ai-sdk.pro` in production)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

Google production callback: `https://www.ai-sdk.pro/auth/platform`. This route forwards the callback to Better Auth.
