import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), requireUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./db/client", () => ({ getNeonSql: () => mocks.sql }));
vi.mock("@/lib/auth", () => ({ requireSessionUser: mocks.requireUser }));
import {
  deletePreset,
  listPresets,
  readProfile,
  savePreset,
  saveProfile,
} from "./workspace-data";
import { POST as postProfile } from "../app/api/platform/profile/route";
import {
  POST as postPreset,
  DELETE as deletePresetRoute,
} from "../app/api/platform/presets/route";
import {
  PlatformAuthenticationError,
  resetPlatformRateLimitsForTests,
} from "./platform-policy";
const input = {
  title: "Test",
  prompt: "Explain streaming",
  providerPreference: "openai" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  resetPlatformRateLimitsForTests();
  mocks.sql.mockResolvedValue([]);
  mocks.requireUser.mockResolvedValue({
    id: "neon-owner",
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
  });
});
function request(
  path: string,
  body: unknown,
  origin = "https://platform.ai-sdk.pro"
) {
  return new Request("https://platform.ai-sdk.pro/api/platform/" + path, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("Neon workspace persistence", () => {
  it("binds reads and deletes to the authenticated owner as SQL parameters", async () => {
    await readProfile("user-a");
    await listPresets("user-b");
    await deletePreset("user-b", 5);
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual(["user-a"]);
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual(["user-b"]);
    expect(mocks.sql.mock.calls[2].slice(1)).toEqual(["user-b", 5]);
    expect(mocks.sql.mock.calls[2][0].join("?")).toContain(
      "WHERE user_id = ? AND slot = ?"
    );
  });
  it("reports the preset quota/concurrent collision instead of false success", async () => {
    expect(await savePreset("user-a", input)).toBe(false);
    mocks.sql.mockResolvedValueOnce([{ slot: 1 }]);
    expect(await savePreset("user-a", input)).toBe(true);
    expect(mocks.sql.mock.calls[0][0].join("?")).toContain(
      "generate_series(1, 100)"
    );
  });
  it("validates profile and preset sizes before persistence", async () => {
    await expect(
      saveProfile("user-a", { displayName: "A", aboutMe: "x".repeat(501) })
    ).rejects.toThrow();
    await expect(
      savePreset("user-a", { ...input, prompt: "x".repeat(2001) })
    ).rejects.toThrow();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
describe("workspace data route boundaries", () => {
  it("rejects anonymous profile writes before storage", async () => {
    mocks.requireUser.mockRejectedValueOnce(new PlatformAuthenticationError());
    expect(
      (
        await postProfile(
          request("profile", { displayName: "Ada", aboutMe: "" })
        )
      ).status
    ).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes before auth", async () => {
    expect(
      (await postPreset(request("presets", input, "https://evil.example")))
        .status
    ).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it("rejects owner spoofing and unexpected sensitive fields", async () => {
    expect(
      (await postPreset(request("presets", { ...input, userId: "other" })))
        .status
    ).toBe(400);
    expect(
      (
        await postProfile(
          request("profile", {
            displayName: "Ada",
            aboutMe: "",
            apiKey: "should-not-be-stored",
          })
        )
      ).status
    ).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("rejects oversized streamed request bodies", async () => {
    expect(
      (
        await postProfile(
          request("profile", { displayName: "Ada", aboutMe: "x".repeat(17000) })
        )
      ).status
    ).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("uses the session owner, never a supplied preset owner", async () => {
    mocks.sql.mockResolvedValueOnce([{ slot: 1 }]);
    expect((await postPreset(request("presets", input))).status).toBe(201);
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([
      "neon-owner",
      input.title,
      input.prompt,
      "openai",
      "neon-owner",
    ]);
  });
  it("rejects invalid deletion identifiers before SQL", async () => {
    const req = new Request(
      "https://platform.ai-sdk.pro/api/platform/presets?id=101",
      { method: "DELETE", headers: { Origin: "https://platform.ai-sdk.pro" } }
    );
    expect((await deletePresetRoute(req)).status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
