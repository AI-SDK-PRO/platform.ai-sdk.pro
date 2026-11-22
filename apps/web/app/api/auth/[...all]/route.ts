import { getSupabaseAuth } from "@/lib/supabase-auth";
import { readWorkspaceJson } from "@/lib/request-json";
import { getManagedSession, isAllowedAuthEndpoint } from "@/lib/auth";
import {
  isTrustedMutationOrigin,
  jsonError,
  safePlatformError,
  trustedPlatformOrigins,
  resolvePublicOrigin,
  noStoreHeaders,
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
    let input: Record<string, unknown> = {};
    if (request.method === "POST") {
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
            : operation === "reset-password"
              ? input.newPassword
              : undefined;
        if (
          ["sign-up/email", "reset-password"].includes(operation) &&
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
    }
    const operation = path.join("/");
    if (operation === "get-session")
      return Response.json(await getManagedSession(), { headers: noStoreHeaders() });

    const auth = await getSupabaseAuth();
    const origin = resolvePublicOrigin(request);
    const callback = new URL("/api/auth/callback", origin);
    const email = typeof input.email === "string" ? input.email : "";
    const password = typeof input.password === "string" ? input.password : "";
    const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
    const respond = (result: { error: { status?: number; code?: string } | null }) => {
      if (!result.error) return Response.json({ ok: true }, { headers: noStoreHeaders() });
      const { code, status = 400 } = result.error;
      const publicCode =
        code === "email_not_confirmed" || code === "invalid_credentials" ||
        code === "otp_expired" || code === "signup_disabled" || code === "weak_password"
          ? code
          : code === "provider_disabled" || code === "provider_not_supported"
            ? "provider_disabled"
            : status === 429 ? "rate_limited" : status >= 500 ? "service_unavailable" : "auth_failed";
      return Response.json({ error: "Authentication operation failed.", code: publicCode }, {
        status: code === "email_not_confirmed" ? 403 : status,
        headers: noStoreHeaders(),
      });
    };

    switch (operation) {
      case "sign-up/email":
        return respond(await auth.signUp({
          email, password,
          options: { data: { name: input.name }, emailRedirectTo: callback.href },
        }));
      case "sign-in/email":
        return respond(await auth.signInWithPassword({ email, password }));
      case "sign-in/social":
      case "link-social": {
        if (input.provider !== "github" && input.provider !== "google")
          return jsonError("Unsupported provider.", 400);
        if (operation === "link-social") callback.searchParams.set("flow", "link");
        const options = { redirectTo: callback.href, skipBrowserRedirect: true };
        const result = operation === "link-social"
          ? await auth.linkIdentity({ provider: input.provider, options })
          : await auth.signInWithOAuth({ provider: input.provider, options });
        if (result.error || !result.data.url) return respond(result.error ? result : { error: { status: 502 } });
        return Response.json({ url: result.data.url }, { headers: noStoreHeaders() });
      }
      case "sign-out":
        return respond(await auth.signOut({ scope: "local" }));
      case "send-verification-email":
        return respond(await auth.resend({ type: "signup", email, options: { emailRedirectTo: callback.href } }));
      case "request-password-reset": {
        const result = await auth.resetPasswordForEmail(email, {
          redirectTo: new URL("/api/auth/recovery", origin).href,
        });
        if (result.error && (result.error.status === 429 || (result.error.status ?? 0) >= 500))
          return respond(result);
        return Response.json({ ok: true }, { headers: noStoreHeaders() });
      }
      case "reset-password": {
        if (typeof input.token !== "string" || !input.token)
          return jsonError("Invalid recovery token.", 400);
        const recovery = await auth.verifyOtp({ type: "recovery", token_hash: input.token });
        if (recovery.error) return respond(recovery);
        try {
          return respond(await auth.updateUser({ password: newPassword }));
        } finally {
          await auth.signOut({ scope: "local" });
        }
      }
      default:
        return jsonError("Unsupported authentication operation.", 404);
    }
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
export const GET = handle;
export const POST = handle;
