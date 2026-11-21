import { requireSessionUser } from "@/lib/auth";
import {
  profileInput,
  readProfile,
  saveProfile,
  readWorkspaceJson,
} from "@/lib/workspace-data";
import {
  checkPlatformRateLimit,
  isTrustedMutationOrigin,
  jsonError,
  noStoreHeaders,
  safePlatformError,
} from "@/lib/platform-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    return Response.json(
      {
        profile: (await readProfile(user.id)) ?? {
          displayName: user.name,
          aboutMe: "",
        },
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request))
    return jsonError("Invalid request origin.", 403);
  try {
    const user = await requireSessionUser(request);
    if (!checkPlatformRateLimit(user.id, "profile-write"))
      return jsonError("Too many requests.", 429);
    let input;
    try {
      input = profileInput.parse(await readWorkspaceJson(request));
    } catch {
      return jsonError("Invalid profile.", 400);
    }
    await saveProfile(user.id, input);
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
