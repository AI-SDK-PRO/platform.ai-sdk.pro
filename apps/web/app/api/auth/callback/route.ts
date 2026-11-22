import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { getSupabaseAuth, verifySupabaseEmail } from "@/lib/supabase-auth";
import { resolvePublicOrigin } from "@/lib/platform-policy";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = resolvePublicOrigin(request);
  const query = new URL(request.url).searchParams;
  const code = query.get("code");
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const tokenHash = query.get("token_hash");
  const failureCode = tokenHash ? "email_link_invalid" : "oauth_failed";
  const failed = redirect(SIGN_IN_PATH + "?auth_error=" + failureCode);
  if (!code && !tokenHash) return failed;

  try {
    if (!code) {
      return tokenHash && await verifySupabaseEmail(tokenHash) ? redirect(SIGN_IN_PATH + "?email_confirmed=1") : failed;
    }
    const auth = await getSupabaseAuth();
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) return failed;
    const destination = query.get("flow") === "link" ? "/workspace/account" : "/";
    return redirect(destination);
  } catch {
    return failed;
  }
}
