import { getSupabaseAuth } from "@/lib/supabase-auth";
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
    const auth = await getSupabaseAuth();
    const { error } = code
      ? await auth.exchangeCodeForSession(code)
      : await auth.verifyOtp({ type: "email", token_hash: tokenHash! });
    if (error) return failed;
    const destination = query.get("flow") === "link" ? "/workspace/account" : "/";
    return redirect(destination);
  } catch {
    return failed;
  }
}
