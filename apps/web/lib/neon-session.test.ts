import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./neon-auth", () => ({
  getAuth: () => ({ getSession: mocks.getSession }),
}));
vi.mock("./db/client", () => ({
  getPlatformDb: () => ({ insert: mocks.insert }),
}));
vi.mock("./github-connection", () => ({ readConnectedGitHubToken: vi.fn() }));
import { getSessionUser, requireSessionUser } from "./auth";
import { POST as exchange } from "../app/api/auth/firebase-session/route";
const request = new Request("https://ai-sdk.pro/api/repositories", {
  headers: { cookie: "__Host-aisdk-session=old-firebase-cookie" },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.upsert });
  mocks.upsert.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("Neon is the only workspace identity authority", () => {
  it("does not authenticate a legacy Firebase cookie when Neon has no session", async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    expect(await getSessionUser(request)).toBeNull();
    await expect(requireSessionUser(request)).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects unverified Neon identities before app persistence", async () => {
    mocks.getSession.mockResolvedValue({
      data: { user: { id: "neon-user", emailVerified: false } },
      error: null,
    });
    expect(await getSessionUser(request)).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("keys app data to the verified Neon ID, not a caller-supplied or email-linked ID", async () => {
    const user = {
      id: "neon-user",
      name: "Ada",
      email: "ada@example.com",
      emailVerified: true,
      image: null,
    };
    mocks.getSession.mockResolvedValue({
      data: { user, session: { token: "synthetic-private-token" } },
      error: null,
    });
    expect(await requireSessionUser(request)).toEqual(user);
    expect(mocks.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: "true" },
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "neon-user", emailVerified: true })
    );
    expect(mocks.upsert).toHaveBeenCalled();
  });
  it("fails closed on Neon outages or failed app writes", async () => {
    mocks.getSession.mockResolvedValue({
      error: { message: "unavailable" },
      data: null,
    });
    await expect(requireSessionUser(request)).rejects.toMatchObject({
      status: 503,
    });
    mocks.getSession.mockResolvedValue({
      data: {
        user: {
          id: "neon-user",
          name: "Ada",
          email: "ada@example.com",
          emailVerified: true,
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
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
