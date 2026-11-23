import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getSession: vi.fn(),
  completeGitHubConnection: vi.fn(),
  requireSessionUser: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  listOwnedRepositories: vi.fn(),
  getOwnedRepository: vi.fn(),
  getOwnedRepositoryDetail: vi.fn(),
  getOwnedRepositoryFile: vi.fn(),
  buildRepositorySnapshot: vi.fn(),
  persistRepositorySnapshot: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  createAssistantAgent: vi.fn(),
  createAgentUIStreamResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ getSupabaseAuth: mocks.getAuth }));
vi.mock("@/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getManagedSession: mocks.getSession,
    getGitHubAccessToken: mocks.getGitHubAccessToken,
    requireSessionUser: mocks.requireSessionUser,
  };
});
vi.mock("@/lib/repository-queries", () => ({
  getOwnedRepository: mocks.getOwnedRepository,
  getOwnedRepositoryDetail: mocks.getOwnedRepositoryDetail,
  getOwnedRepositoryFile: mocks.getOwnedRepositoryFile,
  listOwnedRepositories: mocks.listOwnedRepositories,
}));
vi.mock("@/lib/github/repositories", () => ({
  buildRepositorySnapshot: mocks.buildRepositorySnapshot,
  listAccessibleGitHubRepositories: vi.fn(),
}));
vi.mock("@/lib/repository-persistence", () => ({
  persistRepositorySnapshot: mocks.persistRepositorySnapshot,
}));
vi.mock("@/agents/assistant-agent", () => ({
  createAssistantAgent: mocks.createAssistantAgent,
}));
vi.mock("ai", () => ({
  createAgentUIStreamResponse: mocks.createAgentUIStreamResponse,
}));
vi.mock("@/lib/github-connection", () => ({
  completeGitHubConnection: mocks.completeGitHubConnection,
}));

import {
  PlatformAuthenticationError,
  resetPlatformRateLimitsForTests,
} from "@/lib/platform-policy";
import { POST as postChat } from "./chat/route";
import { POST as postAuthEndpoint } from "./auth/[...all]/route";
import { POST as postSessionRenewal } from "./platform/session/route";
import { GET as getRepositoryDetail } from "./repositories/[id]/route";
import { GET as getRepositoryFile } from "./repositories/[id]/files/route";
import { POST as postRepositoryImport } from "./repositories/route";

const userB = {
  id: "user-b",
  name: "Workspace User B",
  email: "user-b@example.invalid",
  image: null,
};
const validCredentials = {
  provider: "openai",
  model: "gpt-5-mini",
  apiKey: "synthetic-key-for-tests-0123456789",
};
const userMessage = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

function requestWithJson(
  url: string,
  body: unknown,
  origin = "https://ai-sdk.pro"
) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function authContext(...path: string[]) {
  return { params: Promise.resolve({ all: path }) };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
  vi.stubEnv("BETTER_AUTH_URL", "https://ai-sdk.pro");
  vi.stubEnv(
    "SUPABASE_DB_URL",
    "postgres://fixture:fixture@127.0.0.1/fixture"
  );
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-test-secret-not-used-for-auth");
  vi.stubEnv("GITHUB_CLIENT_ID", "synthetic-client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "synthetic-client-secret");
  vi.stubEnv("GITHUB_APP_SLUG", "ai-sdk-pro");
  vi.stubEnv("APP_ORIGINS", "https://ai-sdk.pro");
  vi.stubEnv("TRUST_PROXY", "false");
  vi.stubEnv("BYOK_ONLY", "true");

  for (const mock of Object.values(mocks)) mock.mockReset();
  resetPlatformRateLimitsForTests();

  mocks.getAuth.mockResolvedValue({
    signInWithPassword: mocks.signInWithPassword,
    signOut: mocks.signOut,
  });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.getSession.mockResolvedValue(null);
  mocks.completeGitHubConnection.mockResolvedValue(
    new Response("synthetic-github-callback", { status: 200 })
  );
  mocks.requireSessionUser.mockResolvedValue(userB);
  mocks.getGitHubAccessToken.mockResolvedValue("synthetic-github-token");
  mocks.listOwnedRepositories.mockResolvedValue([]);
  mocks.getOwnedRepository.mockResolvedValue(null);
  mocks.getOwnedRepositoryDetail.mockResolvedValue(null);
  mocks.getOwnedRepositoryFile.mockResolvedValue(null);
  mocks.buildRepositorySnapshot.mockResolvedValue({});
  mocks.persistRepositorySnapshot.mockResolvedValue("new-repository-id");
  mocks.createAssistantAgent.mockResolvedValue({
    agent: {},
    close: vi.fn().mockResolvedValue(undefined),
  });
  mocks.createAgentUIStreamResponse.mockResolvedValue(
    new Response("safe assistant output", {
      headers: { "x-vercel-ai-ui-message-stream": "v1" },
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("chat route security boundary", () => {
  it("rejects an untrusted browser origin before constructing a provider", async () => {
    const response = await postChat(
      requestWithJson(
        "https://ai-sdk.pro/api/chat",
        { messages: [userMessage], byok: validCredentials },
        "https://attacker.example"
      )
    );

    expect(response.status).toBe(403);
    expect(mocks.createAssistantAgent).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied system roles before provider construction", async () => {
    const response = await postChat(
      requestWithJson("https://ai-sdk.pro/api/chat", {
        messages: [{ ...userMessage, role: "system" }],
        byok: validCredentials,
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createAssistantAgent).not.toHaveBeenCalled();
  });

  it("rejects a BYOK endpoint override instead of forwarding credentials to an arbitrary host", async () => {
    const response = await postChat(
      requestWithJson("https://ai-sdk.pro/api/chat", {
        messages: [userMessage],
        byok: { ...validCredentials, baseURL: "https://attacker.example" },
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createAssistantAgent).not.toHaveBeenCalled();
  });

  it("keeps the valid BYOK path usable without reflecting the synthetic key in the response", async () => {
    const response = await postChat(
      requestWithJson("https://ai-sdk.pro/api/chat", {
        messages: [userMessage],
        byok: validCredentials,
      })
    );
    const output = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-transform"
    );
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(mocks.createAssistantAgent).toHaveBeenCalledWith(
      expect.any(AbortSignal),
      expect.objectContaining({ apiKey: validCredentials.apiKey })
    );
    expect(output).toContain("safe assistant output");
    expect(output).not.toContain(validCredentials.apiKey);
  });
});

describe("Supabase auth route boundary", () => {
  it("does not expose provider access-token APIs", async () => {
    const response = await postAuthEndpoint(
      requestWithJson("https://ai-sdk.pro/api/auth/get-access-token", {}),
      authContext("get-access-token")
    );
    expect(response.status).toBe(404);
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });
  it("rejects cross-site sign-in before calling Supabase", async () => {
    const response = await postAuthEndpoint(
      requestWithJson(
        "https://ai-sdk.pro/api/auth/sign-in/email",
        {},
        "https://attacker.example"
      ),
      authContext("sign-in", "email")
    );
    expect(response.status).toBe(403);
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });
  it("dispatches trusted login to the same-origin Supabase Auth route", async () => {
    const response = await postAuthEndpoint(
      requestWithJson("https://ai-sdk.pro/api/auth/sign-in/email", {
        email: "user@example.com",
        password: "test-only",
      }),
      authContext("sign-in", "email")
    );
    expect(response.status).toBe(200);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com", password: "test-only",
    });
  });
  it("rejects hostile callback URLs and oversized auth bodies before proxying", async () => {
    for (const body of [
      { provider: "google", callbackURL: "https://attacker.example/steal" },
      { password: "x".repeat(17000) },
    ]) {
      const response = await postAuthEndpoint(
        requestWithJson("https://ai-sdk.pro/api/auth/sign-in/social", body),
        authContext("sign-in", "social")
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });
  it("supports empty-body sign-out without retaining a session on proxy success", async () => {
    const response = await postAuthEndpoint(
      new Request("https://ai-sdk.pro/api/auth/sign-out", {
        method: "POST",
        headers: { Origin: "https://ai-sdk.pro" },
      }),
      authContext("sign-out")
    );
    expect(response.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("enforces registration password bounds on the server, not only in the form", async () => {
    const response = await postAuthEndpoint(
      requestWithJson("https://ai-sdk.pro/api/auth/sign-up/email", {
        name: "Ada",
        email: "ada@example.com",
        password: "short",
      }),
      authContext("sign-up", "email")
    );
    expect(response.status).toBe(400);
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });
  it("maps unverified email login cleanly to 403 without leaking internals", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      error: { status: 400, code: "email_not_confirmed", message: "raw supabase detail" },
    });
    const response = await postAuthEndpoint(
      requestWithJson("https://ai-sdk.pro/api/auth/sign-in/email", {
        email: "user@example.com",
        password: "test-only-password",
      }),
      authContext("sign-in", "email")
    );
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data).toEqual({ error: "Email address is not verified yet." });
  });
  it("supports PKCE recovery session password reset and signs out locally afterwards", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mocks.getAuth.mockResolvedValueOnce({
      getUser,
      updateUser,
      signOut: mocks.signOut,
    });
    const response = await postAuthEndpoint(
      requestWithJson("https://ai-sdk.pro/api/auth/reset-password", {
        token: "session",
        newPassword: "very-secure-new-password",
      }),
      authContext("reset-password")
    );
    expect(response.status).toBe(200);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ password: "very-secure-new-password" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not intercept Supabase GitHub sign-in with repository OAuth", async () => {
    const { GET } = await import("./auth/[...all]/route");
    const response = await GET(
      new Request("https://ai-sdk.pro/api/auth/callback/github"),
      authContext("callback", "github")
    );
    expect(response.status).toBe(404);
    expect(mocks.completeGitHubConnection).not.toHaveBeenCalled();
  });
});

describe("protected workspace route security boundary", () => {
  it("does not reveal a repository to a request without a verified session", async () => {
    mocks.requireSessionUser.mockRejectedValueOnce(
      new PlatformAuthenticationError()
    );
    const response = await getRepositoryDetail(
      new Request("https://ai-sdk.pro/api/repositories/repo-owned-by-user-a"),
      routeContext("repo-owned-by-user-a")
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getOwnedRepositoryDetail).not.toHaveBeenCalled();
  });

  it("scopes detail lookup to the authenticated tenant and masks a foreign repository as not found", async () => {
    const response = await getRepositoryDetail(
      new Request("https://ai-sdk.pro/api/repositories/repo-owned-by-user-a"),
      routeContext("repo-owned-by-user-a")
    );

    expect(response.status).toBe(404);
    expect(mocks.getOwnedRepositoryDetail).toHaveBeenCalledWith(
      userB.id,
      "repo-owned-by-user-a"
    );
  });

  it.each(["../secrets.txt", "/etc/passwd", "src\\..\\secrets.txt"])(
    "rejects repository file traversal input %s before any file lookup",
    async path => {
      const url = `https://ai-sdk.pro/api/repositories/repo-a/files?path=${encodeURIComponent(path)}`;
      const response = await getRepositoryFile(
        new Request(url),
        routeContext("repo-a")
      );

      expect(response.status).toBe(400);
      expect(mocks.getOwnedRepositoryFile).not.toHaveBeenCalled();
    }
  );

  it("scopes a safe file lookup to the authenticated tenant and hides a foreign snapshot", async () => {
    const response = await getRepositoryFile(
      new Request(
        "https://ai-sdk.pro/api/repositories/repo-a/files?path=src%2Findex.ts"
      ),
      routeContext("repo-a")
    );

    expect(response.status).toBe(404);
    expect(mocks.getOwnedRepositoryFile).toHaveBeenCalledWith(
      userB.id,
      "repo-a",
      "src/index.ts"
    );
  });

  it("rejects cross-site repository imports before session, GitHub, or persistence calls", async () => {
    const response = await postRepositoryImport(
      requestWithJson(
        "https://ai-sdk.pro/api/repositories",
        { fullName: "owner/demo", installationId: 7 },
        "https://attacker.example"
      )
    );

    expect(response.status).toBe(403);
    expect(mocks.requireSessionUser).not.toHaveBeenCalled();
    expect(mocks.getGitHubAccessToken).not.toHaveBeenCalled();
    expect(mocks.persistRepositorySnapshot).not.toHaveBeenCalled();
  });

  it("rejects unexpected import fields and repository-name injection before calling GitHub", async () => {
    const unexpectedField = await postRepositoryImport(
      requestWithJson("https://ai-sdk.pro/api/repositories", {
        fullName: "owner/demo",
        installationId: 7,
        userId: "user-a",
      })
    );
    const hostileName = await postRepositoryImport(
      requestWithJson("https://ai-sdk.pro/api/repositories", {
        fullName: "attacker.example/../../private",
        installationId: 7,
      })
    );

    expect(unexpectedField.status).toBe(400);
    expect(hostileName.status).toBe(400);
    expect(mocks.getGitHubAccessToken).not.toHaveBeenCalled();
    expect(mocks.buildRepositorySnapshot).not.toHaveBeenCalled();
  });
});

describe("browser session renewal boundary", () => {
  it("rejects cross-site renewal before reading or refreshing a session", async () => {
    const response = await postSessionRenewal(
      new Request("https://ai-sdk.pro/api/platform/session", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: "{}",
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it("renews only through the trusted route and returns a sanitized no-store session envelope", async () => {
    mocks.getSession.mockResolvedValue({
      user: { ...userB, emailVerified: true },
      session: {
        expiresAt: new Date(Date.now() + 10800000),
        token: "synthetic-bearer-token",
      },
    });
    const request = new Request("https://ai-sdk.pro/api/platform/session", {
      method: "POST",
      headers: { Origin: "https://ai-sdk.pro" },
      body: "{}",
    });

    const response = await postSessionRenewal(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(body.user).toEqual({
      id: userB.id,
      name: userB.name,
      email: userB.email,
      image: null,
    });
    expect(typeof body.expiresAt).toBe("string");
    expect(new Date(String(body.expiresAt)).getTime()).toBeGreaterThan(
      Date.now()
    );
    expect(JSON.stringify(body)).not.toContain("synthetic-bearer-token");
  });
});
