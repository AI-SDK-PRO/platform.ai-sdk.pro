# Supabase migration

## Preview configuration

- Use a Preview database isolated from Production. Configure Vercel Preview with
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  and the server-only `SUPABASE_DB_URL` from the same Supabase project.
  Use the transaction pooler DSN for the Vercel runtime. Run
  `npm run platform:migrate --workspace=apps/web` with an owner DSN to apply the schema.
- Keep `BETTER_AUTH_SECRET` as the existing platform GitHub connection signing
  and encryption secret. If the previous effective value came from
  `NEON_AUTH_COOKIE_SECRET`, use that same value for `BETTER_AUTH_SECRET` to
  preserve the ability to decrypt existing GitHub connections.
- Enable and configure GitHub, Google, email/password, Confirm Email and SMTP
  in Supabase. Enable manual identity linking for the account settings buttons.
  Register the Supabase project's provider callback in each login OAuth app.
  Keep GitHub repository OAuth on the existing GitHub App and
  `/api/connections/github/callback`.
- Allow the exact Preview origins followed by `/api/auth/callback`,
  `/api/auth/callback?flow=link` and `/api/auth/recovery` in Supabase.
  Set `BETTER_AUTH_URL` to the app origin and add additional trusted app
  origins to `APP_ORIGINS` as needed.
- In the confirmation email template, link to
  `{{ .RedirectTo }}?token_hash={{ .TokenHash }}`. Use the same link expression
  in the password recovery template. The confirmation and recovery requests
  provide different RedirectTo values. The confirmation route consumes the
  email token. The recovery form consumes the recovery token when submitted.
- Keep `aisdk_pro` outside the Supabase Data API exposed schemas. The app uses
  server-side Postgres and checks resource ownership in its API routes.
  The migration revokes schema/table access from browser roles and enables RLS.

## Existing data and users

1. Inventory both Neon schemas and backing jobs. Take a restricted backup and
   record row counts, foreign keys, and timestamp ranges for the application
   tables in `aisdk_pro`. Preserve application IDs, encrypted GitHub tokens
   and deployment references. Do not import old sessions, verification tokens,
   or the managed Neon Auth schema.
2. Apply the Supabase schema on Preview. Import the data in dependency order:
   application users, GitHub repository connections, imported repositories and
   their files, profiles/presets, platform tokens, deployment projects and
   deployment intake. Import only the `github-repository` account rows.
   Sanitize sensitive data before using it outside the production boundary.
3. Provision Supabase Auth users through an approved admin workflow. Record
   each independently verified correspondence in
   `aisdk_pro.auth_identity (supabase_id, user_id)` before allowing old users to
   sign in. Do not grant old workspace access based solely on an email string.
   Use password recovery for accounts whose passwords cannot be migrated.
   New Supabase users automatically get a separate application user ID.
4. Compare counts and foreign keys, then test Google and GitHub sign-in,
   signup, confirmation, recovery, logout, chat, and repository import from
   Preview. Test that two real accounts cannot access each other's workspace
   data and that a mapped account retains its existing projects and connections.
5. Before Production cutover, pause writes and the preview dispatcher, reconcile
   the final changes, verify the deployment and restart writers on Supabase.
   Keep the previous deployment and Neon backup. To roll back after new
   Supabase writes, pause writes again and reconcile them before restoring the
   old deployment and database target. Existing sessions will require sign-in
   after either cutover or rollback.
