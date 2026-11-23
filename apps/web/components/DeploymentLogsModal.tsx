"use client";

import { useEffect, useMemo } from "react";
import { ArrowUpRight, Pause, Play, RefreshCw, ShieldCheck, Terminal, X } from "lucide-react";
import type { DeploymentEntry, DeploymentProject, WebhookLogEntry } from "../lib/deploy-bridge";

type Props = {
  open: boolean;
  project: DeploymentProject | null;
  focusedDeploymentId: string | null;
  deployments: DeploymentEntry[];
  webhookLogs: WebhookLogEntry[];
  webhookVerificationActive: boolean;
  lastCheckedAt: string | null;
  polling: boolean;
  autoPolling: boolean;
  pollError: string;
  onToggleAutoPolling: () => void;
  onRefreshNow: () => void;
  onClose: () => void;
};

type LogLine = {
  key: string;
  timestampMs: number;
  timeLabel: string;
  source: "WEBHOOK" | "DEPLOY";
  status: string;
  tone: "success" | "error" | "active" | "neutral";
  message: string;
  url: string | null;
};

function isSafeDeploymentUrl(url: string | null) {
  try {
    const parsed = new URL(url || "");
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".ai-sdk.pro");
  } catch {
    return false;
  }
}

function statusTone(status: string): LogLine["tone"] {
  const normalized = status.toLowerCase();
  if (normalized === "success" || normalized === "submitted" || normalized === "ready") return "success";
  if (normalized === "failed" || normalized === "rejected" || normalized === "error") return "error";
  if (normalized === "queued" || normalized === "building" || normalized === "pending" || normalized === "dispatching") {
    return "active";
  }
  return "neutral";
}

function formatTime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "--:--:--";
  return new Date(ms).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseTimestamp(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function buildDeploymentLogLines(
  deployments: DeploymentEntry[],
  webhookLogs: WebhookLogEntry[],
  focusedDeploymentId: string | null
): LogLine[] {
  const lines: LogLine[] = [];
  const focusedDeployment = focusedDeploymentId
    ? deployments.find(item => item.id === focusedDeploymentId) ?? null
    : null;

  for (const item of deployments) {
    if (focusedDeployment && item.id !== focusedDeployment.id) continue;
    const createdMs = parseTimestamp(item.created_at);
    const shortSha = item.commit_sha ? item.commit_sha.slice(0, 8) : "unknown";
    lines.push({
      key: `deploy-created-${item.id}`,
      timestampMs: createdMs,
      timeLabel: formatTime(createdMs),
      source: "DEPLOY",
      status: item.status,
      tone: statusTone(item.status),
      message: `Deployment ${item.id.slice(0, 8)} (${shortSha}) status: ${item.status}`,
      url: item.status === "success" && isSafeDeploymentUrl(item.url) ? item.url : null,
    });
    if (item.finished_at) {
      const finishedMs = parseTimestamp(item.finished_at);
      lines.push({
        key: `deploy-finished-${item.id}`,
        timestampMs: finishedMs,
        timeLabel: formatTime(finishedMs),
        source: "DEPLOY",
        status: item.status,
        tone: statusTone(item.status),
        message: `Deployment ${item.id.slice(0, 8)} finished as ${item.status}`,
        url: item.status === "success" && isSafeDeploymentUrl(item.url) ? item.url : null,
      });
    }
  }

  for (const event of webhookLogs) {
    if (focusedDeployment && event.commitSha !== focusedDeployment.commit_sha) continue;
    const receivedMs = parseTimestamp(event.receivedAt);
    const shortSha = event.commitSha.slice(0, 8);
    lines.push({
      key: `webhook-${event.deliveryId}`,
      timestampMs: receivedMs,
      timeLabel: formatTime(receivedMs),
      source: "WEBHOOK",
      status: event.dispatchStatus,
      tone: statusTone(event.dispatchStatus),
      message: `Webhook delivery ${event.deliveryId.slice(0, 8)} · ${event.target} (${event.branch} @ ${shortSha}) -> ${event.dispatchStatus}${event.githubRunId ? ` (Run #${event.githubRunId})` : ""}`,
      url: null,
    });
    if (event.dispatchStartedAt) {
      const startedMs = parseTimestamp(event.dispatchStartedAt);
      lines.push({
        key: `webhook-start-${event.deliveryId}`,
        timestampMs: startedMs,
        timeLabel: formatTime(startedMs),
        source: "WEBHOOK",
        status: event.dispatchStatus,
        tone: statusTone(event.dispatchStatus),
        message: `Dispatcher picked up ${event.branch} @ ${shortSha} (${event.dispatchStatus})`,
        url: null,
      });
    }
  }

  return lines.sort((a, b) => b.timestampMs - a.timestampMs);
}

export default function DeploymentLogsModal({
  open,
  project,
  focusedDeploymentId,
  deployments,
  webhookLogs,
  webhookVerificationActive,
  lastCheckedAt,
  polling,
  autoPolling,
  pollError,
  onToggleAutoPolling,
  onRefreshNow,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const logLines = useMemo(
    () => buildDeploymentLogLines(deployments, webhookLogs, focusedDeploymentId),
    [deployments, webhookLogs, focusedDeploymentId]
  );

  if (!open || !project) return null;

  const latestDeployment = focusedDeploymentId
    ? deployments.find(item => item.id === focusedDeploymentId) ?? deployments[0]
    : deployments[0];

  return (
    <div
      className="deploy-logs-backdrop"
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="deploy-logs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deployment-logs-modal-title"
      >
        <div className="deploy-logs-head">
          <div>
            <span className="workspace-section-kicker">REAL-TIME DEPLOYMENT LOGS</span>
            <h2 id="deployment-logs-modal-title">
              <Terminal size={18} /> {project.name}
            </h2>
            <p className="deploy-logs-subtitle">
              <code>{project.repo_full_name}</code> · Branch <code>{project.branch}</code>
              {latestDeployment ? ` · Latest: ${latestDeployment.status}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="deploy-logs-close"
            onClick={onClose}
            aria-label="Close deployment logs modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="deploy-logs-toolbar">
          <div className="deploy-logs-badges">
            <span className={`deploy-logs-pill ${autoPolling ? "is-live" : ""}`}>
              <span className="deploy-logs-dot" aria-hidden="true" />
              {polling ? "Syncing…" : autoPolling ? "Live polling (3s)" : "Polling paused"}
            </span>
            <span className="deploy-logs-pill">
              <ShieldCheck size={13} />
              {webhookVerificationActive
                ? "GitHub webhook HMAC: Verified on server"
                : "GitHub webhook HMAC: Inactive"}
            </span>
            {lastCheckedAt && (
              <span className="deploy-logs-timestamp">
                Updated {formatTime(parseTimestamp(lastCheckedAt))}
              </span>
            )}
          </div>
          <div className="deploy-logs-controls">
            <button
              type="button"
              className="workspace-button workspace-button-secondary"
              onClick={onToggleAutoPolling}
            >
              {autoPolling ? <Pause size={14} /> : <Play size={14} />}
              {autoPolling ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              className="workspace-button workspace-button-secondary"
              onClick={onRefreshNow}
              disabled={polling}
            >
              <RefreshCw size={14} className={polling ? "workspace-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {pollError && (
          <p className="unified-deploy-warning" role="alert">
            {pollError}
          </p>
        )}

        <div className="deploy-logs-stream" aria-live="polite">
          {logLines.length === 0 ? (
            <div className="deploy-logs-empty">
              No deployment or GitHub webhook events recorded for this repository yet. Trigger a deploy or push to{" "}
              <code>{project.branch}</code> to watch live status updates here.
            </div>
          ) : (
            logLines.map(line => (
              <div key={line.key} className="deploy-logs-line">
                <span className="deploy-logs-time">{line.timeLabel}</span>
                <span className="deploy-logs-source">{line.source}</span>
                <span className={`deploy-logs-status tone-${line.tone}`}>{line.status}</span>
                <span className="deploy-logs-message">{line.message}</span>
                {line.url && (
                  <a href={line.url} target="_blank" rel="noreferrer" className="deploy-logs-link">
                    Open <ArrowUpRight size={12} />
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
