import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  findMapping: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./supabase-auth", () => ({
  getSupabaseAuth: async () => ({ getSession: mocks.getSession, getUser: mocks.getUser }),
}));
vi.mock("./db/client", () => ({
  getPlatformDb: () => ({ insert: mocks.insert, select: () => ({ from: () => ({ where: mocks.findMapping }) }) }),
}));
vi.mock("./github-connection", () => ({ readConnectedGitHubToken: vi.fn() }));
import { getSessionUser, requireSessionUser } from "./auth";
import { POST as exchange } from "../app/api/auth/firebase-session/route";
const request = new Request("https://ai-sdk.pro/api/repositories", {
  headers: { cookie: "__Host-aisdk-session=old-firebase-cookie" },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMapping.mockResolvedValue([]);
  mocks.getSession.mockResolvedValue({ data: { session: { expires_at: 1800000000 } } });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.upsert });
  mocks.upsert.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("Supabase is the only workspace identity authority", () => {
  it("does not authenticate a legacy Firebase cookie when Supabase has no session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getSessionUser(request)).toBeNull();
    await expect(requireSessionUser(request)).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects unverified Supabase identities before app persistence", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "supabase-user", email: "ada@example.com" } },
      error: null,
    });
    expect(await getSessionUser(request)).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("keys app data to the verified Supabase ID, not a caller-supplied or email-linked ID", async () => {
    const user = {
      id: "supabase-user",
      name: "Ada",
      email: "ada@example.com",
      emailVerified: true,
      image: null,
    };
    mocks.getUser.mockResolvedValue({
      data: { user: { ...user, email_confirmed_at: "now", user_metadata: { name: "Ada" } } },
      error: null,
    });
    expect(await requireSessionUser(request)).toEqual(user);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    mocks.findMapping.mockResolvedValue([{ userId: "legacy-user" }]);
    expect(await requireSessionUser(request)).toEqual({ ...user, id: "legacy-user" });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "supabase-user", emailVerified: true })
    );
    expect(mocks.upsert).toHaveBeenCalled();
  });
  it("fails closed on Supabase outages or failed app writes", async () => {
    mocks.getUser.mockResolvedValue({
      error: { message: "unavailable" },
      data: null,
    });
    await expect(requireSessionUser(request)).rejects.toMatchObject({
      status: 503,
    });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "supabase-user",
          name: "Ada",
          email: "ada@example.com",
          email_confirmed_at: "now",
          user_metadata: {},
        },
      },
      error: null,
    });
    mocks.upsert.mockRejectedValue(new Error("database unavailable"));
    await expect(requireSessionUser(request)).rejects.toThrow(
      "database unavailable"
    );
  });
  it("retires Firebase token exchange without issuing any session", async () => {
    const response = await exchange();
    expect(response.status).toBe(410);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
