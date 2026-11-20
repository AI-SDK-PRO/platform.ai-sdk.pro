# Vercel Schedules and Cloudflare R2 — ai-sdk.pro

## Installed schedule

- Skill: `vercel-schedules` installed with `npx skills add vercel/vercel-plugin --skill vercel-schedules`.
- Static schedule: `platform-health`, every day at 09:00 in `Asia/Bangkok` (Vercel jitter applies).
- Private handler: Docs Next.js service, `app/api/schedules/health/route`.
- Behavior: read-only GET of `https://platform.ai-sdk.pro/api/health`. Failures are recorded in Schedule executions; no database changes, repository mutations or auto-deploys.

## Release checklist

1. Verify the Vercel Services build output contains the private function under `.vercel/output/services/docs/functions` with only `schedule/v1beta` as trigger. The `function` field in root `vercel.json` is its output path without `.func`.
2. Docs TypeScript check and Next.js build passed in Vercel Sandbox; a **Vercel Services Preview deployment and invocation** are still required.
3. Enable Preview schedule temporarily, invoke `platform-health` and inspect its execution history. Confirm no public HTTP route exposes the handler.
4. Merge after Preview succeeds, keeping Verified Commits protection enabled. Static schedules activate when a Production deployment becomes current.
5. Dashboard: Vercel Project → Schedules. No public `path` fallback.

## R2 storage

The Cloudflare account owning `ai-sdk.pro` responded with error `10042`: enable R2 in the Cloudflare Dashboard before any bucket can be created.

After activation, inventory existing buckets, then create/select a **private** bucket and scope R2 S3 API credentials to that bucket. Set `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` only as server-side Vercel secrets. Use S3 endpoint `https://<account-id>.r2.cloudflarestorage.com` with region `auto`.

Keep Vercel Blob in place until authenticated upload/list/download and cross-user isolation on R2 are tested. Do not enable public bucket URLs or copy production objects automatically.

References: https://vercel.com/docs/schedules and https://developers.cloudflare.com/r2/api/s3/presigned-urls/
