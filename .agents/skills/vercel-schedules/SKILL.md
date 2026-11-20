---
name: vercel-schedules
description: Vercel Schedules guidance â€” run a private function, route, or Vercel Queues topic on a cron cadence or once at a set time. Covers static schedules in vercel.json, dynamic per-user schedules with @vercel/schedules, handleSchedule, the vercel schedules CLI, environments, jitter, and migrating from Cron Jobs. Use when adding scheduled or recurring work, one-time reminders, or replacing `crons`.
summary: "Vercel Schedules replaces Cron Jobs. Static schedules go in vercel.json under `schedules` and target a private `function` (with an `experimentalTriggers: [{ type: 'schedule/v1beta' }]` trigger; the default), a queue `topic`, or a public `path` (only to migrate Cron Jobs without code changes). Dynamic schedules come from `Schedules.create()` in `@vercel/schedules` or `vercel schedules create`, target queue topics only, and support one-time runs, payloads, and namespaces. Wrap function handlers in `handleSchedule`; make handlers idempotent with `executionId`."
metadata:
  priority: 6
  docs:
    - "https://vercel.com/docs/schedules"
    - "https://vercel.com/docs/schedules/quickstart"
    - "https://vercel.com/docs/schedules/handle-runs"
    - "https://vercel.com/docs/schedules/configuration"
    - "https://vercel.com/docs/schedules/sdk"
    - "https://vercel.com/docs/cli/schedules"
  sitemap: "https://vercel.com/sitemap.xml"
  pathPatterns:
    - 'vercel.json'
    - 'app/api/schedules/**'
    - 'src/app/api/schedules/**'
    - 'api/schedu¶»§q«^