import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authenticatedDeployContext: vi.fn(),
  controlPlane: vi.fn(),
  getPlatformSql: vi.fn(),
}));

vi.mock("@/lib/deploy-bridge", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/deploy-bridge")>();
  return {
    ...actual,
    authenticatedDeployContext: mocks.authenticatedDeployContext,
    controlPlane: mocks.controlPlane,
  };
});

vi.mock("@/lib/db/client", () => ({
  getPlatformSql: mocks.getPlatformSql,
}));

import { PlatformAuthenticationError, resetPlatformRateLimitsForTests } from "@/lib/platform-policy";
import { GET } from "./route";

const projectId = "11111111-1111-4111-8111-111111111111";

function routeContext(id = projectId) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  resetPlatformRateLimitsForTests();
  vi.stubEnv("GITHUB_DEPLOY_WEBHOOK_SECRET", "super-secret-webhook-signing-key-should-never-leak");
  vi.stubEnv("PLATFORM_BRIDGE_SECRET", "super-secret-bridge-signing-key-should-never-leak");

  mocks.authenticatedDeployContext.mockResolvedValue({
    userId: "user-1",
    token: "gh-token-secret",
    actor: { githubId: 42, login: "octocat" },
  });
  mocks.controlPlane.mockImplementation(async (_actor, operation) => {
    if (operation === "list") {
      return {
        projects: [
          {
            id: projectId,
            name: "demo-site",
            repo_full_name: "octocat/demo-site",
            repo_id: 9001,
            branch: "main",
            framework: "static",
            output_dir: null,
            active_deployment_id: "dep-1",
          },
        ],
        routingReady: true,
        frameworkBuilds: false,
        projectDomain: "ai-sdk.pro",
      };
    }
    return {
      deployments: [
        {
          id: "dep-1",
          commit_sha: "abcdef1234567890abcdef1234567890abcdef12",
          status: "building",
          url: null,
          created_at: 1795300000,
          finished_at: null,
        },
      ],
    };
  });
  mocks.getPlatformSql.mockReturnValue(async () => [
    {
      delivery_id: "22222222-2222-4222-8222-222222222222",
      target: "production",
      branch: "main",
      commit_sha: "abcdef1234567890abcdef1234567890abcdef12",
      dispatch_status: "submitted",
      received_at: "2026-11-22T18:00:00.000Z",
      dispatch_started_at: "2026-11-22T18:00:02.000Z",
      github_run_id: 778899,
    },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/deploy/projects/[id]/deployments", () => {
  it("rejects unauthenticated requests with 401", async () => {
    mocks.authenticatedDeployContext.mockRejectedValueOnce(new PlatformAuthenticationError());
    const response = await GET(
      new Request(`https://platform.ai-sdk.pro/api/deploy/projects/${projectId}/deployments`),
      routeContext()
    );
    expect(response.status).toBe(401);
    expect(mocks.controlPlane).not.toHaveBeenCalled();
  });

  it("masks non-owned projects as 404", async () => {
    const response = await GET(
      new Request("https://platform.ai-sdk.pro/api/deploy/projects/99999999-9999-4999-8999-999999999999/deployments"),
      routeContext("99999999-9999-4999-8999-999999999999")
    );
    expect(response.status).toBe(404);
  });

  it("returns deployment history, scoped webhook logs, and boolean verification flag without leaking secrets", async () => {
    const response = await GET(
      new Request(`https://platform.ai-sdk.pro/api/deploy/projects/${projectId}/deployments`),
      routeContext()
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const text = await response.text();
    expect(text).not.toContain("super-secret-webhook-signing-key-should-never-leak");
    expect(text).not.toContain("super-secret-bridge-signing-key-should-never-leak");
    expect(text).not.toContain("gh-token-secret");

    const data = JSON.parse(text);
    expect(data.webhookVerificationActive).toBe(true);
    expect(data.deployments).toHaveLength(1);
    expect(data.webhookLogs).toEqual([
      {
        deliveryId: "22222222-2222-4222-8222-222222222222",
        target: "production",
        branch: "main",
        commitSha: "abcdef1234567890abcdef1234567890abcdef12",
        dispatchStatus: "submitted",
        receivedAt: "2026-11-22T18:00:00.000Z",
        dispatchStartedAt: "2026-11-22T18:00:02.000Z",
        githubRunId: 778899,
      },
    ]);
  });
});
