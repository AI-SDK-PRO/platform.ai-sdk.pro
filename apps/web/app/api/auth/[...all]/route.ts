import { toNextJsHandler } from "better-auth/next-js";
import { getAuth, isAllowedAuthEndpoint } from "@/lib/auth";
import { isTrustedMutationOrigin, jsonError, noStoreHeaders, safePlatformError, trustedPlatformOrigins } from "@/lib/platform-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ all?: string[] }> };

async function sanitize(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  if (!(headers.get("content-type") || "").includes("application/json")) return new Response(response.body, { status: response.status, headers });
  try {
    const payload = await response.json() as Record<string, unknown>;
    delete payload.token;
    if (payload.session && typeof payload.session === "object") delete (payload.session as Record<string, unknown>).token;
    return Response.json(payload, { status: response.status, headers });
  } catch { return jsonError("Authentication response could not be read.", 500); }
}

async function handle(request: Request, context: Context) {
  const path = (await context.params).all?.join("/") ?? "";
  if (!isAllowedAuthEndpoint(request.method, path)) return jsonError("Unsupported authentication operation.", 404);
  if (request.method === "POST" && !isTrustedMutationOrigin(request)) return jsonError("Invalid request origin.", 403);
  try {
    if (path === "get-session") {
      return sanitize(await getAuth().api.getSession({ headers: request.headers, query: { disableRefresh: true }, asResponse: true }));
    }
    if (path === "sign-in/social") {
      let body: unknown;
      try { body = await request.json(); } catch { return jsonError("Invalid sign-in request.", 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid sign-in request.", 400);
      const input = body as Record<string, unknown>;
      if (input.provider !== "google" || Object.keys(input).some(key => !["provider", "callbackURL", "errorCallbackURL", "newUserCallbackURL"].includes(key)))
        return jsonError("Only Google sign-in is available.", 400);
      for (const key of ["callbackURL", "errorCallbackURL", "newUserCallbackURL"]) {
        if (input[key] === undefined) continue;
        if (typeof input[key] !== "string" || !trustedPlatformOrigins().includes(new URL(input[key] as string, request.url).origin))
          return jsonError("Invalid sign-in redirect.", 400);
      }
      const headers = new Headers(request.headers);
      headers.set("content-type", "application/json");
      const safeBody = { ...input, provider: "google" };
      const forwarded = new Request(request.url, { method: "POST", headers, body: JSON.stringify(safeBody) });
      return sanitize(await toNextJsHandler(getAuth()).POST(forwarded));
    }
    return sanitize(await toNextJsHandler(getAuth())[request.method as "GET" | "POST"](request));
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}

export const GET = handle;
export const POST = handle;
