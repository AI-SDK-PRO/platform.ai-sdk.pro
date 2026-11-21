import { readWorkspaceJson } from "@/lib/request-json";
import { getAuth, isAllowedAuthEndpoint } from "@/lib/auth";
import {
  isTrustedMutationOrigin,
  jsonError,
  safePlatformError,
  trustedPlatformOrigins,
} from "@/lib/platform-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ all?: string[] }> };
async function handle(request: Request, context: Context) {
  const path = (await context.params).all ?? [];
  if (!isAllowedAuthEndpoint(request.method, path.join("/")))
    return jsonError("Unsupported authentication operation.", 404);
  if (request.method !== "GET" && !isTrustedMutationOrigin(request))
    return jsonError("Invalid request origin.", 403);
  try {
    if (request.method === "POST") {
      let input: Record<string, unknown>;
      try {
        const body =
          !request.body && path.join("/") === "sign-out"
            ? {}
            : await readWorkspaceJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Error();
        input = body as Record<string, unknown>;
        const operation = path.join("/");
        if (operation === "sign-up/email") {
          if (process.env.PLATFORM_EMAIL_AUTH_ENABLED === "false")
            return jsonError("Email registration is not enabled.", 503);
          if (
            typeof input.name !== "string" ||
            input.name.trim().length < 2 ||
            input.name.length > 120
          )
            throw new Error();
        }
        const password =
          operation === "sign-up/email"
            ? input.password
            : ["reset-password", "change-password"].includes(operation)
              ? input.newPassword
              : undefined;
        if (
          ["sign-up/email", "reset-password", "change-password"].includes(
            operation
          ) &&
          (typeof password !== "string" ||
            password.length < 12 ||
            password.length > 128)
        )
          throw new Error();
        for (const key of [
          "callbackURL",
          "newUserCallbackURL",
          "errorCallbackURL",
          "redirectTo",
        ]) {
          if (input[key] === undefined) continue;
          if (typeof input[key] !== "string") throw new Error();
          const url = new URL(input[key] as string, request.url);
          if (!trustedPlatformOrigins().includes(url.origin)) throw new Error();
        }
      } catch {
        return jsonError("Invalid authentication request or redirect.", 400);
      }
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      request = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(input),
      });
    }
    const handler = getAuth().handler();
    return await handler[request.method as "GET" | "POST"](request, {
      params: Promise.resolve({ path }),
    });
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
export const GET = handle;
export const POST = handle;
