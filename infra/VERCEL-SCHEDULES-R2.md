# Vercel Schedules and Cloudflare R2 (ai-sdk.pro)

## Schedule installed
- The vercel-schedules skill was installed with npx skills add vercel/vercel-plugin --skill vercel-schedules.
- A static schedule named platform-health is defined in the project-root vercel.json.
- Runs at 09:00 in Asia/Bangkok every day (with Vercel plan jitter).
- Private function in the docs Next.js service: app/api/schedules/health/route.
- The handler performs a read-only GET on the existing platform health endpoint and logs success or failure. It does not import repositories, deploy user code, or mutate data.

## Before production
1. Verify the service build output path under .vercel/output/services/docs/functions and that the function has only schedule/v1beta trigger.
2. Run typecheck and Next.js build for apps/docs; test a Preview build through Vercel Services. Keep Verified Commits checks enabled.
3. Once Preview is deployed, enable the Preview schedule temporarily and invoke platform-health; inspect execution history and verify no public route was created.
4. Merge only after Vercel build and private schedule tests pass. Production schedules become active when their deployment becomes current.
5. Check Vercel Dashboard > Schedules for runs. Do not change the target to a public URL merely to avoid Services support checks.

## R2
Cloudflare R2 can be accessed from Vercel via the S3-compatible API without moving the web hosting. However the Cloudflare account that owns ai-sdk.pro currently returns¶»§q«^