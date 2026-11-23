import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import DeploymentLogsModal, { buildDeploymentLogLines } from "./DeploymentLogsModal";

beforeAll(() => {
  Object.assign(globalThis, { React });
});

describe("DeploymentLogsModal", () => {
  const project = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "demo-site",
    repo_full_name: "octocat/demo-site",
    repo_id: 9001,
    branch: "main",
    framework: "static",
    output_dir: null,
    active_deployment_id: "dep-1",
  };

  it("merges deployment status and webhook events into chronological log lines while blocking unsafe URLs", () => {
    const lines = buildDeploymentLogLines(
      [
        {
          id: "dep-1-abcdef",
          commit_sha: "abcdef1234567890abcdef1234567890abcdef12",
          status: "success",
          url: "https://demo-site.ai-sdk.pro",
          created_at: 1795300000,
          finished_at: 1795300010,
        },
        {
          id: "dep-2-evil",
          commit_sha: "1234567890abcdef1234567890abcdef12345678",
          status: "success",
          url: "javascript:alert(1)",
          created_at: 1795300020,
          finished_at: 1795300025,
        },
      ],
      [
        {
          deliveryId: "22222222-2222-4222-8222-222222222222",
          target: "production",
          branch: "main",
          commitSha: "abcdef1234567890abcdef1234567890abcdef12",
          dispatchStatus: "submitted",
          receivedAt: "2026-11-22T18:00:00.000Z",
          dispatchStartedAt: "2026-11-22T18:00:02.000Z",
          githubRunId: 551,
        },
      ],
      null
    );

    expect(lines.some(line => line.url === "https://demo-site.ai-sdk.pro")).toBe(true);
    expect(lines.some(line => line.url === "javascript:alert(1)")).toBe(false);
    expect(lines.some(line => line.source === "WEBHOOK" && line.message.includes("Run #551"))).toBe(true);
  });

  it("renders accessible dialog with live polling and server-side webhook verification state", () => {
    const html = renderToStaticMarkup(
      React.createElement(DeploymentLogsModal, {
        open: true,
        project,
        focusedDeploymentId: null,
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
        webhookLogs: [
          {
            deliveryId: "22222222-2222-4222-8222-222222222222",
            target: "production",
            branch: "main",
            commitSha: "abcdef1234567890abcdef1234567890abcdef12",
            dispatchStatus: "submitted",
            receivedAt: "2026-11-22T18:00:00.000Z",
            dispatchStartedAt: null,
            githubRunId: null,
          },
        ],
        webhookVerificationActive: true,
        lastCheckedAt: "2026-11-22T18:00:05.000Z",
        polling: false,
        autoPolling: true,
        pollError: "",
        onToggleAutoPolling: () => {},
        onRefreshNow: () => {},
        onClose: () => {},
      })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Live polling (3s)");
    expect(html).toContain("GitHub webhook HMAC: Verified on server");
    expect(html).toContain("octocat/demo-site");
    expect(html).toContain("building");
    expect(html).toContain("submitted");
  });
});
