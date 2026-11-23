"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Cloud, GitBranch, Github, Globe, LoaderCircle, RefreshCw, Rocket, ShieldCheck, Terminal } from "lucide-react";
import { authClient } from "../lib/auth-client";
import type { GitHubRepository, GitHubRepositoryList, PlatformSession, PlatformStatus } from "../lib/platform-types";
import type { DeploymentEntry, ProjectList, WebhookLogEntry } from "../lib/deploy-bridge";
import DeploymentLogsModal from "./DeploymentLogsModal";
import WorkspaceChrome from "./WorkspaceChrome";

type Phase = "loading" | "signed-out" | "setup" | "ready" | "error";
type State = ProjectList | null;
type DeploymentPollPayload = {
  deployments: DeploymentEntry[];
  webhookLogs?: WebhookLogEntry[];
  webhookVerificationActive?: boolean;
  checkedAt?: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin", cache: "no-store", ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    let text = "Request failed (HTTP " + response.status + ").";
    try {
      const body = await response.json() as {error?: unknown};
      if (typeof body.error === "string" && body.error.length < 180) text = body.error;
    } catch { /* keep status */ }
    throw new Error(text);
  }
  return response.json() as Promise<T>;
}

function slugOf(repo: string) {
  return repo.split("/").at(-1)?.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "";
}

function isSafeUrl(url: string | null) {
  try {
    const parsed = new URL(url || "");
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".ai-sdk.pro");
  } catch { return false; }
}

export default function WorkspaceDeploy() {
  const searchParams = useSearchParams();
  const hintedRepo = searchParams.get("repo");
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<PlatformSession>({ user: null });
  const [backend, setBackend] = useState<State>(null);
  const [backendError, setBackendError] = useState("");
  const [githubLinked, setGithubLinked] = useState(false);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [projectName, setProjectName] = useState("");
  const [framework, setFramework] = useState("auto");
  const [outputDir, setOutputDir] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [history, setHistory] = useState<DeploymentEntry[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogEntry[]>([]);
  const [webhookVerificationActive, setWebhookVerificationActive] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [focusedDeploymentId, setFocusedDeploymentId] = useState<string | null>(null);
  const [autoPolling, setAutoPolling] = useState(true);
  const [logsPolling, setLogsPolling] = useState(false);
  const [logsPollError, setLogsPollError] = useState("");
  const pollInFlightRef = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setPhase("loading");
      setError("");
      try {
        const [status, current] = await Promise.all([
          requestJson<PlatformStatus>("/api/platform/status", { signal: controller.signal }),
          requestJson<PlatformSession>("/api/platform/session", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setSession(current);
        if (!status.configured) { setPhase("setup"); return; }
        if (!current.user) { setPhase("signed-out"); return; }
        const [repoResult, control] = await Promise.allSettled([
          requestJson<GitHubRepositoryList>("/api/github/repositories", { signal: controller.signal }),
          requestJson<ProjectList>("/api/deploy/projects", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (repoResult.status === "fulfilled") {
          setGithubLinked(true);
          setRepositories(repoResult.value.repositories);
          setInstallUrl(repoResult.value.installUrl);
          setSelectedRepo(previous => previous || repoResult.value.repositories.find(item => item.fullName === hintedRepo)?.fullName || repoResult.value.repositories[0]?.fullName || "");
        } else {
          setGithubLinked(false);
          setError("Connect GitHub in Account Settings to import repositories.");
        }
        if (control.status === "fulfilled") {
          setBackend(control.value);
          setBackendError("");
        } else {
          setBackend(null);
          setBackendError(control.reason instanceof Error ? control.reason.message : "Deployment backend unavailable.");
        }
        setPhase("ready");
      } catch {
        if (!controller.signal.aborted) setPhase("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [version, hintedRepo]);

  const repo = useMemo(() => repositories.find(r => r.fullName === selectedRepo), [repositories, selectedRepo]);
  const project = useMemo(() => backend?.projects.find(p => p.id === selectedProject), [backend, selectedProject]);
  const canDeploy = Boolean(backend?.routingReady && project &&
    (backend.frameworkBuilds || project.framework === "static"));

  const fetchDeploymentsSnapshot = useCallback(
    async (id: string, signal?: AbortSignal) => {
      if (!id || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      setLogsPolling(true);
      try {
        const result = await requestJson<DeploymentPollPayload>(
          "/api/deploy/projects/" + encodeURIComponent(id) + "/deployments",
          { signal }
        );
        if (signal?.aborted) return;
        setHistory(result.deployments);
        setWebhookLogs(result.webhookLogs ?? []);
        setWebhookVerificationActive(Boolean(result.webhookVerificationActive));
        setLastCheckedAt(result.checkedAt ?? new Date().toISOString());
        setLogsPollError("");
      } catch (caught) {
        if (signal?.aborted) return;
        const message = caught instanceof Error ? caught.message : "Could not load deployments.";
        setLogsPollError(message);
        if (/HTTP (?:401|403|404)/.test(message)) {
          setAutoPolling(false);
        }
        throw caught;
      } finally {
        pollInFlightRef.current = false;
        setLogsPolling(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!logsModalOpen || !project || !autoPolling) return;
    const controller = new AbortController();
    void fetchDeploymentsSnapshot(project.id, controller.signal).catch(() => undefined);
    const intervalId = window.setInterval(() => {
      void fetchDeploymentsSnapshot(project.id, controller.signal).catch(() => undefined);
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [logsModalOpen, project, autoPolling, fetchDeploymentsSnapshot]);

  async function importProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repo || !backend || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{project:{id:string;hostname:string}}>("/api/deploy/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName || slugOf(repo.fullName),
          repository: repo.fullName,
          installationId: repo.installationId,
          framework,
          ...(outputDir.trim() ? {outputDir: outputDir.trim()} : {}),
        }),
      });
      setSelectedProject(result.project.id);
      setNotice("Project registered on the existing Cloudflare control plane. Build is not queued automatically.");
      setVersion(x => x + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Project could not be registered."); }
    finally { setBusy(false); }
  }

  async function selectProject(id: string) {
    setSelectedProject(id);
    setHistory([]);
    setWebhookLogs([]);
    setLastCheckedAt(null);
    setLogsPollError("");
    setError("");
    if (!id) return;
    try {
      await fetchDeploymentsSnapshot(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load deployments.");
    }
  }

  function openLogsModal(deploymentId: string | null = null) {
    setFocusedDeploymentId(deploymentId);
    setAutoPolling(true);
    setLogsPollError("");
    setLogsModalOpen(true);
  }

  async function deploy() {
    if (!project || !canDeploy || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{queued:boolean;deploymentId?:string|null}>(
        "/api/deploy/projects/" + encodeURIComponent(project.id) + "/deployments", { method: "POST" });
      setNotice(result.queued ? "Deployment was queued. Check live history for the result." : "This commit has already been queued.");
      await selectProject(project.id);
      if (result.queued) openLogsModal(result.deploymentId ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Deploy could not be queued."); }
    finally { setBusy(false); }
  }

  async function logout() {
    setLogoutPending(true);
    try { const result = await authClient.signOut(); if (result.error) throw new Error("Sign out failed."); window.location.assign("/login"); }
    catch { setLogoutPending(false); setError("Could not sign out."); }
  }

  return (
    <WorkspaceChrome user={session.user} onLogout={() => { void logout(); }} logoutPending={logoutPending}>
      <div className="unified-deploy">
        <div className="unified-deploy-head">
          <div>
            <span className="workspace-section-kicker">WORKSPACE / DEPLOY</span>
            <h1>Deploy โปรเจกต์</h1>
            <p>GitHub → Import → Build → Preview → Publish ผ่านบัญชีเดียวกับ ai-sdk.pro</p>
          </div>
          <div className="unified-deploy-actions">
            <Link href="/workspace/regions" className="workspace-button workspace-button-secondary">
              <Globe size={15} /> Regions Map
            </Link>
            <button type="button" className="workspace-button workspace-button-secondary"
              onClick={() => setVersion(x => x + 1)}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>
        {phase === "loading" && <p role="status"><LoaderCircle size={16} className="workspace-spin" /> กำลังตรวจสอบ Session และ Deploy Backend…</p>}
        {phase === "signed-out" && <div className="unified-deploy-notice"><h2>เข้าสู่ระบบก่อนใช้งาน</h2>
          <p>ใช้บัญชี ai-sdk.pro ของคุณได้เลย ไม่จำเป็นต้องมี GitHub ในขั้นตอนสมัคร</p><Link href="/login" className="workspace-button workspace-button-primary">Sign in</Link></div>}
        {phase === "setup" && <p role="alert">ระบบบัญชี Workspace ยังตั้งค่าไม่ครบ</p>}
        {phase === "error" && <p role="alert">ไม่สามารถตรวจสอบ Workspace ได้ กรุณาลอง Refresh</p>}
        {phase === "ready" && <>
          <div className="unified-deploy-state">
            <span><ShieldCheck size={15} /> ai-sdk.pro account signed in</span>
            <span><Cloud size={15} /> Cloudflare control plane: {backend ? "Connected" : "Not activated"}</span>
            <span><Rocket size={15} /> Project routing: {backend?.routingReady ? "Ready" : "Not enabled"}</span>
          </div>
          {!githubLinked && <div className="unified-deploy-warning">กรุณา <Link href="/workspace/account">เชื่อม GitHub ใน Account Settings</Link> ก่อน Import หรือ Deploy</div>}
          {backend?.quota && <p className="unified-deploy-plan" role="status">
            {backend.role === "owner" ? "Owner / Developer" : backend.plan === "free" ? "Free" : "Pro"} · {backend.quota.usedProjects}/{backend.quota.maxProjects} projects · GitHub Push updates the existing URL automatically
          </p>}
          {backendError && <p className="unified-deploy-warning" role="alert">{backendError} ไม่ได้เปิดหน้า Login หรือ Dashboard ที่แยกโดเมน</p>}
          {notice && <p className="unified-deploy-success" role="status">{notice}</p>}
          {error && <p className="unified-deploy-warning" role="alert">{error}</p>}
          <div className="unified-deploy-grid">
            <section className="unified-deploy-card">
              <div className="unified-deploy-step">01 · GITHUB REPOSITORY</div>
              <h2>นำเข้าโปรเจ็กต์</h2>
              <p>เลือก Repository จาก GitHub App ที่ผูกกับบัญชีนี้</p>
              <form onSubmit={event => { void importProject(event); }}>
                <label htmlFor="deploy-repo">Repository</label>
                <select id="deploy-repo" value={selectedRepo} onChange={event => {
                  setSelectedRepo(event.target.value);
                  setProjectName(slugOf(event.target.value));
                }} disabled={!repositories.length || busy}>
                  {repositories.map(item => <option key={item.id} value={item.fullName}>{item.fullName}</option>)}
                </select>
                <label htmlFor="deploy-name">ชื่อโปรเจ็กต์ / Subdomain</label>
                <input id="deploy-name" value={projectName} onChange={event => setProjectName(event.target.value.toLowerCase())}
                  placeholder={slugOf(selectedRepo)} maxLength={40} required />
                <label htmlFor="deploy-framework">Framework</label>
                <select id="deploy-framework" value={framework} onChange={event => setFramework(event.target.value)}>
                  <option value="auto">Auto detect</option><option value="static">Static HTML</option>
                  <option value="astro">Astro static</option><option value="nextjs">Next.js static export</option>
                </select>
                <label htmlFor="deploy-output">Output folder (optional)</label>
                <input id="deploy-output" value={outputDir} onChange={event => setOutputDir(event.target.value)}
                  placeholder="public / dist / out" maxLength={96} />
                <div className="unified-deploy-actions">
                  <button className="workspace-button workspace-button-primary" type="submit"
                    disabled={!backend || !repo || busy}>{busy ? "Processing…" : "Register Project"}</button>
                  {installUrl && <a target="_blank" rel="noreferrer" href={installUrl}>Manage GitHub App <ArrowUpRight size={13} /></a>}
                </div>
              </form>
            </section>
            <section className="unified-deploy-card">
              <div className="unified-deploy-step">02 · BUILD & PUBLISH</div>
              <h2>โปรเจ็กต์ของฉัน</h2>
              <p>แสดงโปรเจ็กต์จาก Cloudflare Control Plane เดิม ไม่สร้างรายการจำลอง</p>
              {!backend && <p>Control Plane ยังไม่ได้เชื่อมกับ Workspace</p>}
              {backend && backend.projects.length === 0 && <p>ยังไม่มีโปรเจ็กต์ที่ลงทะเบียน</p>}
              {backend?.projects.map(item => (
                <button type="button" className={"unified-deploy-project" + (selectedProject === item.id ? " selected" : "")}
                  key={item.id} onClick={() => { void selectProject(item.id); }}>
                  <span><strong>{item.name}</strong><small><Github size={12} /> {item.repo_full_name}</small></span>
                  <GitBranch size={15} />
                </button>
              ))}
              {project && <div className="unified-deploy-project-details">
                <h3>{project.name}</h3>
                <p>Branch: <code>{project.branch}</code> · Framework: {project.framework}</p>
                <div className="unified-deploy-actions">
                  <button type="button" className="workspace-button workspace-button-primary"
                    onClick={() => { void deploy(); }} disabled={!canDeploy || busy}>
                    <Rocket size={14} /> {busy ? "Processing…" : "Deploy selected branch"}
                  </button>
                  <button type="button" className="workspace-button workspace-button-secondary"
                    onClick={() => openLogsModal(null)}>
                    <Terminal size={14} /> Deployment Logs
                  </button>
                </div>
                {!backend?.routingReady && <p className="unified-deploy-warning">ยังไม่เปิด DNS/Workers routing ของโปรเจ็กต์ จึงยังไม่รับคำสั่ง Deploy เพื่อไม่สร้าง Deploy ที่เปิด URL ไม่ได้</p>}
                {backend?.routingReady && !canDeploy && <p>Framework builds ยังไม่เปิด กรุณาใช้ Static HTML ที่รองรับใน Pilot</p>}
                <h3>Deployment history</h3>
                {history.length === 0 && <p>ไม่มี Deployment ที่บันทึกไว้</p>}
                {history.map(item => (
                  <div key={item.id} className="unified-deploy-history">
                    <code>{item.commit_sha.slice(0,8)}</code><span>{item.status}</span>
                    <div className="unified-deploy-history-links">
                      <button
                        type="button"
                        className="workspace-button workspace-button-secondary"
                        onClick={() => openLogsModal(item.id)}
                      >
                        Logs
                      </button>
                      {item.status === "success" && isSafeUrl(item.url) && <a href={item.url!} target="_blank" rel="noreferrer">Open <ArrowUpRight size={13} /></a>}
                    </div>
                  </div>
                ))}
              </div>}
            </section>
          </div>
        </>}
      </div>
      <DeploymentLogsModal
        open={logsModalOpen}
        project={project ?? null}
        focusedDeploymentId={focusedDeploymentId}
        deployments={history}
        webhookLogs={webhookLogs}
        webhookVerificationActive={webhookVerificationActive}
        lastCheckedAt={lastCheckedAt}
        polling={logsPolling}
        autoPolling={autoPolling}
        pollError={logsPollError}
        onToggleAutoPolling={() => setAutoPolling(prev => !prev)}
        onRefreshNow={() => {
          if (project) void fetchDeploymentsSnapshot(project.id).catch(() => undefined);
        }}
        onClose={() => setLogsModalOpen(false)}
      />
    </WorkspaceChrome>
  );
}
