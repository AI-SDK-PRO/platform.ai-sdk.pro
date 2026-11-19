# Cloudflare Workers deployment

The PR #4 and PR #5 deployment paths have been reconciled; use the single canonical guide: [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md).

The selected Worker is the already existing `aisdkpro-web-cloudflare`. It keeps its workers.dev preview URL for validation. `ai-sdk.pro` currently points to Firebase Hosting (A `199.36.158.100`) and is not routed to this Worker until its Next.js Build and authenticated flows are proven healthy.

Do not use the superseded `npm ci && npm install --no-save ...` build hack from this PR's old commits. Instead, sync the dependency lockfile for `@opennextjs/cloudflare` and `wrangler`, run the canonical `npm run cloudflare:build` and `npm run cf:dry-run --workspace=apps/web`, then deploy with Cloudflare Workers Builds once the checks pass.
