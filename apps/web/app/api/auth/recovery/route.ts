import { getSupabaseAuth } from "@/lib/supabase-auth";
import { resolvePublicOrigin } from "@/lib/platform-policy";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  const origin = resolvePublicOrigin(request);
  const redirect = (target: URL) => {
    const response = NextResponse.redirect(target);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (tokenHash) {
    const target = new URL("/reset-password", origin);
    target.searchParams.set("token", tokenHash);
    return redirect(target);
  }
  if (code) {
    try {
      const auth = await getSupabaseAuth();
      const { error } = await auth.exchangeCodeForSession(code);
      if (!error) {
        const target = new URL("/reset-password", origin);
        target.searchParams.set("token", "session");
        return redirect(target);
      }
    } catch {
      // Fall through to generic recovery error redirect.
    }
  }
  return redirect(new URL("/reset-password?error=1", origin));
}
