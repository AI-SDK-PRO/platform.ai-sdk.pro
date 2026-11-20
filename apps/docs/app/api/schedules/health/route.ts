import { handleSchedule } from "@vercel/schedules";

export const runtime = "nodejs";

// Private Vercel Schedule: no browser-facing route, credentials, or mutations.
// Failed checks appear in Vercel Schedules execution history.
export const POST = handleSchedule(async ({ name, executionId, scheduledAt }) => {
  const response = await fetch("https://platform.ai-sdk.pro/api/health", {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error("Platform health check failed: HTTP " + response.status);
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("status" in body) || body.status !== "ok") {
    throw new Error("Platform health endpoint returned an invalid status");
  }
  console.info(JSON.stringify({
    event: "vercel-schedule",
    name,
    executionId,
    scheduledAt: scheduledAt.toISOString(),
    platform: "healthy",
  }));
});
