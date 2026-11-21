import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("./db/client", () => ({ getPlatformDb: vi.fn() }));
import { getSessionUser } from "./auth";
import {
  beginGitHubConnection,
  completeGitHubConnection,
} from "./github-connection";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "synthetic-github-signing-secret-over-32-chars"
  );
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
  vi.stubEnv("BETTER_AUTH_URL", "https://platform.ai-sdk.pro");
  vi.stubEnv("GITHUB_CLIENT_ID", "synthetic-public-client");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "synthetic-private-client-secret");
  vi.mocked(getSessionUser).mockResolvedValue({
    id: "neon-owner",
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
  });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("repository OAuth is bound to the Neon user, not the login provider", () => {
  it("uses its dedicated callback and a secure signed-state cookie", async () => {
    const response = await beginGitHubConnection(
      new Request("https://platform.ai-sdk.pro/api/connections/github")
    );
    const target = new URL(response.headers.get("Location")!);
    expect(target.searchParams.get("redirect_uri")).toBe(
      "https://platform.ai-sdk.pro/api/connections/github/callback"
    );
    expect(response.headers.get("Set-Cookie")).toContain(
      "Secure; HttpOnly; SameSite=Lax"
    );
    expect(target.toString()).not.toContain("synthetic-private-client-secret");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not begin repository authorization without a Neon session", async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);
    await expect(
      beginGitHubConnection(
        new Request("https://platform.ai-sdk.pro/api/connections/github")
      )
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a signed-state replay under another Neon user before token exchange", async () => {
    const start = await beginGitHubConnection(
      new Request("https://platform.ai-sdk.pro/api/connections/github")
    );
    const target = new URL(start.headers.get("Location")!);
    const cookie = start.headers.get("Set-Cookie")!.split(";")[0];
    vi.mocked(getSessionUser).mockResolvedValueOnce({
      id: "another-neon-user",
      name: "Other",
      email: "other@example.com",
      emailVerified: true,
      image: null,
    });
    const response = await completeGitHubConnection(
      new Request(
        "https://platform.ai-sdk.pro/api/connections/github/callback?code=synthetic&state=" +
          target.searchParams.get("state"),
        { headers: { Cookie: cookie } }
      )
    );
    expect(response.headers.get("Location")).toBe(
      "https://platform.ai-sdk.pro/workspace/account?error=github"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
