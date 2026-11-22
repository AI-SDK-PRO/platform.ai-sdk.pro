import { resolvePublicOrigin } from "@/lib/platform-policy";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tokenHash = new URL(request.url).searchParams.get("token_hash");
  const origin = resolvePublicOrigin(request);
  if (!tokenHash) return NextResponse.redirect(new URL("/reset-password?error=1", origin));
  const target = new URL("/reset-password", origin);
  target.searchParams.set("token", tokenHash);
  const response = NextResponse.redirect(target);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
