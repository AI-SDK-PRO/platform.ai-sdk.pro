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
  const failed = redirect("/login?auth_error=1");
  const tokenHash = query.get("token_hash");
  if (!code && !tokenHash) return failed;

  try {
    if (!code) {
      return tokenHash && await verifySupabaseEmail(tokenHash) ? redirect("/login") : failed;
    }
    const auth = await getSupabaseAuth();
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) return failed;
    const rawNext = query.get("next");
    const safeNext =
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : "/";
    const destination = query.get("flow") === "link" ? "/workspace/account" : safeNext;
    return redirect(destination);
  } catch {
    return failed;
  }
}
