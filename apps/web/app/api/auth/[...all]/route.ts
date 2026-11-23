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
    const safeErrorForAuth = (err: { status?: number; code?: string }) => {
      switch (err.code) {
        case "email_not_confirmed":
          return { status: 403, message: "Email address is not verified yet." };
        case "invalid_credentials":
          return { status: 401, message: "Invalid email or password." };
        case "over_email_send_rate_limit":
        case "over_request_rate_limit":
          return { status: 429, message: "Too many requests. Please wait and try again." };
        case "weak_password":
          return { status: 400, message: "Password does not meet security requirements." };
        case "email_address_invalid":
          return { status: 400, message: "Invalid email address." };
        case "signup_disabled":
        case "email_provider_disabled":
        case "provider_disabled":
          return { status: 503, message: "This sign-in method is not enabled." };
        default:
          return {
            status: err.status === 429 ? 429 : err.status || 400,
            message:
              err.status === 429
                ? "Too many requests. Please wait and try again."
                : "Authentication operation failed.",
          };
      }
    };
    const respond = (result: { error: { status?: number; code?: string } | null }) => {
      if (!result.error) return Response.json({ ok: true }, { headers: noStoreHeaders() });
      const mapped = safeErrorForAuth(result.error);
      return jsonError(mapped.message, mapped.status);
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
        if (operation === "link-social") {
          callback.searchParams.set("flow", "link");
        } else if (typeof input.callbackURL === "string") {
          try {
            const target = new URL(input.callbackURL, origin);
            if (target.pathname.startsWith("/") && target.pathname !== "/") {
              callback.searchParams.set("next", target.pathname);
            }
          } catch {
            // Ignore malformed optional next path; validated above.
          }
        }
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
        if (input.token === "session") {
          const current = await auth.getUser();
          if (current.error || !current.data.user)
            return jsonError("Invalid recovery session.", 401);
        } else {
          const recovery = await auth.verifyOtp({ type: "recovery", token_hash: input.token });
          if (recovery.error) return respond(recovery);
        }
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
