import "server-only";
import { z } from "zod";
import { getNeonSql } from "./db/client";
import { PlatformSetupRequiredError } from "./platform-policy";
export const profileInput = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    aboutMe: z.string().trim().max(500),
  })
  .strict();
export const presetInput = z
  .object({
    title: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(2000),
    providerPreference: z.enum(["edge-glm", "openai", "anthropic", "google"]),
  })
  .strict();
function database() {
  const sql = getNeonSql();
  if (!sql) throw new PlatformSetupRequiredError();
  return sql;
}
export async function readProfile(userId: string) {
  const rows =
    await database()`SELECT display_name AS "displayName", about_me AS "aboutMe"
    FROM aisdk_pro.workspace_profile WHERE user_id = ${userId}`;
  return rows[0] ?? null;
}
export async function saveProfile(
  userId: string,
  input: z.infer<typeof profileInput>
) {
  const value = profileInput.parse(input);
  await database()`INSERT INTO aisdk_pro.workspace_profile (user_id, display_name, about_me)
    VALUES (${userId}, ${value.displayName}, ${value.aboutMe})
    ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name,
      about_me = EXCLUDED.about_me, updated_at = now()`;
}
export async function listPresets(userId: string) {
  return database()`SELECT slot::text AS id, title, prompt, provider AS "providerPreference"
    FROM aisdk_pro.prompt_preset WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`;
}
export async function savePreset(
  userId: string,
  input: z.infer<typeof presetInput>
) {
  const value = presetInput.parse(input);
  // A fixed set of slots enforces a per-user cumulative limit even under races.
  const rows =
    await database()`INSERT INTO aisdk_pro.prompt_preset (user_id, slot, title, prompt, provider)
    SELECT ${userId}, candidate.slot, ${value.title}, ${value.prompt}, ${value.providerPreference}
    FROM generate_series(1, 100) AS candidate(slot)
    WHERE NOT EXISTS (SELECT 1 FROM aisdk_pro.prompt_preset p WHERE p.user_id = ${userId} AND p.slot = candidate.slot)
    ORDER BY candidate.slot LIMIT 1 ON CONFLICT DO NOTHING RETURNING slot`;
  return rows.length > 0;
}
export async function deletePreset(userId: string, id: number) {
  await database()`DELETE FROM aisdk_pro.prompt_preset WHERE user_id = ${userId} AND slot = ${id}`;
}
export { readWorkspaceJson } from "./request-json";
