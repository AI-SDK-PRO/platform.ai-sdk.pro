"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Github,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
} from "lucide-react";
import WorkspaceChrome from "./WorkspaceChrome";
import NeonSyncPanel from "./NeonSyncPanel";
import { authClient } from "../lib/auth-client";
import type { PlatformSession, PlatformStatus } from "../lib/platform-types";

type AccountStatus = {
  github: boolean;
  password: boolean;
  emailVerified: boolean;
  email: string;
  googleLogin: boolean;
  githubLogin: boolean;
};
type Phase = "loading" | "signed-out" | "ready" | "error";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  if (!response.ok)
    throw new Error("Account API returned HTTP " + response.status);
  return response.json() as Promise<T>;
}

export default function WorkspaceAccount() {
  const [session, setSession] = useState<PlatformSession>({ user: null });
  const [settings, setSettings] = useState<AccountStatus | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function linkLogin(provider: "google" | "github") {
    setError("");
    setBusy(true);
    try {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: window.location.origin + "/workspace/account",
      });
      if (result.error) throw new Error("Link failed.");
    } catch {
      setError("เพิ่มวิธีเข้าสู่ระบบไม่สำเร็จ กรุณาตรวจการตั้งค่า Neon Auth");
    } finally {
      setBusy(false);
    }
  }
  async function setPassword() {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.requestPasswordReset({
        email: settings.email,
        redirectTo: window.location.origin + "/reset-password",
      });
      if (result.error) throw new Error("Request failed.");
      setNotice("กรุณาตรวจอีเมลเพื่อตั้งรหัสผ่านของบัญชี Neon");
    } catch {
      setError("ส่งลิงก์ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    const [current, capabilities] = await Promise.all([
      json<PlatformSession>("/api/platform/session"),
      json<PlatformStatus>("/api/platform/status"),
    ]);
    setSession(current);
    setPlatform(capabilities);
    if (!current.user) {
      setPhase("signed-out");
      return;
    }
    setSettings(await json<AccountStatus>("/api/platform/connected-accounts"));
    setPhase("ready");
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("linked") === "1")
      setNotice("GitHub connection returned. Checking linked account…");
    if (query.has("error"))
      setError("GitHub connection could not be completed. You may retry.");
    void refresh().catch(() => setPhase("error"));
  }, [refresh]);

  function linkGithub() {
    if (busy || !platform?.githubConfigured) return;
    setBusy(true);
    setError("");
    setNotice("");
    // GitHub App repository authorization is separate from Neon GitHub Login.
    // This endpoint binds the OAuth token to the currently authenticated
    // Neon workspace user and validates its signed OAuth state.
    window.location.assign("/api/connections/github");
  }

  async function logout() {
    setLogoutPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed.");
      window.location.assign("/login");
    } catch {
      setLogoutPending(false);
      setError("ไม่สามารถออกจากระบบได้ กรุณาลองใหม่");
    }
  }

  return (
    <WorkspaceChrome
      user={session.user}
      onLogout={() => {
        void logout();
      }}
      logoutPending={logoutPending}
    >
      <section className="workspace-account-settings">
        <span className="workspace-account-kicker">WORKSPACE / ACCOUNT</span>
        <h1>บัญชีและการเชื่อมต่อ</h1>
        <p>
          Neon Auth เป็นบัญชีหลักของคุณ ส่วน GitHub ใช้เชื่อม Repository และ
          Deploy ภายในบัญชีเดียวกัน
        </p>
        {phase === "loading" && (
          <p role="status">
            <LoaderCircle className="workspace-spin" size={16} /> Loading
            account…
          </p>
        )}
        {phase === "signed-out" && (
          <p>
            กรุณา <Link href="/login">เข้าสู่ระบบ</Link> ก่อน
          </p>
        )}
        {phase === "error" && (
          <p role="alert">ไม่สามารถอ่านบัญชีได้ โปรดลองโหลดหน้าใหม่</p>
        )}
        {notice && (
          <p role="status" className="workspace-account-success">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="workspace-account-error">
            {error}
          </p>
        )}
        {phase === "ready" && settings && (
          <>
            <div className="workspace-account-card">
              <h2>
                <ShieldCheck size={20} /> บัญชี ai-sdk.pro
              </h2>
              <p>{settings.email}</p>
              <div className="workspace-account-state">
                <span>
                  <MailCheck size={15} /> Email:{" "}
                  {settings.emailVerified ? "Verified" : "Not verified"}
                </span>
                <span>
                  <LockKeyhole size={15} /> Google:{" "}
                  {settings.googleLogin ? "Connected" : "Not connected"}
                </span>
                <span>
                  <Github size={15} /> GitHub Login:{" "}
                  {settings.githubLogin ? "Connected" : "Not connected"}
                </span>
                <span>
                  <KeyRound size={15} /> Email / Password:{" "}
                  {settings.password ? "Enabled" : "Not set"}
                </span>
              </div>
              {!settings.googleLogin && (
                <button
                  type="button"
                  className="workspace-button workspace-button-secondary"
                  disabled={busy || !settings.emailVerified}
                  onClick={() => {
                    void linkLogin("google");
                  }}
                >
                  Add Google as sign-in method
                </button>
              )}
              {!settings.githubLogin && (
                <button
                  type="button"
                  className="workspace-button workspace-button-secondary"
                  disabled={busy || !settings.emailVerified}
                  onClick={() => {
                    void linkLogin("github");
                  }}
                >
                  <Github size={15} /> Add GitHub as sign-in method
                </button>
              )}
              <button
                type="button"
                className="workspace-button workspace-button-secondary"
                disabled={busy}
                onClick={() => {
                  void setPassword();
                }}
              >
                ส่งอีเมลตั้ง / รีเซ็ตรหัสผ่าน
              </button>
              <p className="workspace-account-help">
                เพิ่มวิธีเข้าสู่ระบบจากหน้านี้เพื่อให้ทุกวิธีใช้ Neon User ID
                และ Workspace เดียวกัน การเชื่อมวิธีเข้าสู่ระบบจัดการโดย Neon
                Auth ไม่ได้ใช้บัญชี Firebase เดิม
              </p>
              {!settings.emailVerified && (
                <p>ยืนยันอีเมลก่อนเพิ่มวิธีเข้าสู่ระบบหรือเชื่อมบัญชีอื่น</p>
              )}
            </div>
            <div className="workspace-account-card">
              <h2>
                <Github size={20} /> สิทธิ์ GitHub Repository
              </h2>
              <p>
                อนุญาตให้แพลตฟอร์มอ่าน Repository สำหรับ Import และ Deploy
                โดยไม่สร้าง User ID ใหม่
              </p>
              <div className="workspace-account-state">
                <span>
                  <Link2 size={15} />{" "}
                  {settings.github ? "GitHub linked" : "GitHub not connected"}
                </span>
              </div>
              {
                <button
                  type="button"
                  className="workspace-button workspace-button-primary"
                  disabled={
                    busy ||
                    !platform?.githubConfigured ||
                    !settings.emailVerified
                  }
                  onClick={() => {
                    void linkGithub();
                  }}
                >
                  <Github size={15} />{" "}
                  {settings.github
                    ? "Reconnect repository access"
                    : "Connect repository access"}
                </button>
              }
              {settings.github && (
                <a
                  className="workspace-button workspace-button-secondary"
                  href={
                    platform?.githubAppInstallUrl ||
                    "https://github.com/apps/ai-sdk-pro/installations/new"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github size={15} /> Manage GitHub App installation
                </a>
              )}
              <p className="workspace-account-help">
                {settings.github
                  ? "GitHub OAuth เชื่อมแล้ว ติดตั้ง GitHub App เพื่อเลือก Repository ที่อนุญาต"
                  : "การอนุญาต Repository แยกจาก GitHub Login และเชื่อมกับบัญชี Workspace เดิมเท่านั้น"}
              </p>
            </div>
          </>
        )}
        {phase === "ready" && <NeonSyncPanel />}
      </section>
    </WorkspaceChrome>
  );
}
