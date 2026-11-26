import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { trustedPlatformOrigins, jsonError, safePlatformError } from "@/lib/platform-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function callback(request: Request) {
  try {
    const url = new URL(request.url);
    if (!trustedPlatformOrigins().includes(url.origin)) return jsonError("Invalid OAuth callback origin.", 400);
    const target = new URL("/api/auth/callback/google", url.origin);
    target.search = url.search;
    const forwarded = new Request(target, { method: request.method, headers: request.headers, body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body });
    const handlers = toNextJsHandler(getAuth());
    return await handlers[request.method as "GET" | "POST"](forwarded);
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}

export const GET = callback;
export const POST = callback;
