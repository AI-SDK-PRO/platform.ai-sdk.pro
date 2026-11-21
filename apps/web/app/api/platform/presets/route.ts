import { requireSessionUser } from "@/lib/auth";
import {
  deletePreset,
  listPresets,
  presetInput,
  savePreset,
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
      { presets: await listPresets(user.id) },
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
    if (!checkPlatformRateLimit(user.id, "preset-write"))
      return jsonError("Too many requests.", 429);
    let input;
    try {
      input = presetInput.parse(await readWorkspaceJson(request));
    } catch {
      return jsonError("Invalid preset.", 400);
    }
    if (!(await savePreset(user.id, input)))
      return jsonError(
        "Preset limit reached or a concurrent save occurred. Refresh and retry.",
        409
      );
    return Response.json(
      { ok: true },
      { status: 201, headers: noStoreHeaders() }
    );
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
export async function DELETE(request: Request) {
  if (!isTrustedMutationOrigin(request))
    return jsonError("Invalid request origin.", 403);
  try {
    const user = await requireSessionUser(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^(?:[1-9][0-9]?|100)$/.test(id))
      return jsonError("Invalid preset.", 400);
    await deletePreset(user.id, Number(id));
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
