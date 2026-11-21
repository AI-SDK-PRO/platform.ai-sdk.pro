import { getAuth } from "./lib/neon-auth";
import { jsonError } from "./lib/platform-policy";
import type { NextRequest } from "next/server";
export default async function proxy(request: NextRequest) {
  try {
    // Also exchanges Neon's OAuth/email-verification verifier into HttpOnly
    // same-origin cookies before the client renders the Workspace.
    return await getAuth().middleware({ loginUrl: "/login" })(request);
  } catch {
    return jsonError("Authentication setup is required.", 503);
  }
}
export const config = { matcher: ["/workspace/:path*"] };
