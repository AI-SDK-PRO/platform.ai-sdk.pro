import { getManagedSession, publicUser } from "@/lib/auth";
import {
  isTrustedMutationOrigin,
  jsonError,
  noStoreHeaders,
  safePlatformError,
} from "@/lib/platform-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function respond(request: Request) {
  if (request.method === "POST" && !isTrustedMutationOrigin(request))
    return jsonError("Origin is not allowed.", 403);
  try {
    const session = await getManagedSession();
    const current = session?.user?.emailVerified === true ? session : null;
    return Response.json(
      {
        user: current ? publicUser(current.user) : null,
        expiresAt: current
          ? new Date(current.session.expiresAt).toISOString()
          : null,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
export const GET = respond;
export const POST = respond;
