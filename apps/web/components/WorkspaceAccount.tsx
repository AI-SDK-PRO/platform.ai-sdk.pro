"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Github,
  Link2,
  LoaderCircle,
  MailCheck,
  ShieldCheck,
} from "lucide-react";
import WorkspaceChrome from "./WorkspaceChrome";
import WorkspacePresets from "./WorkspacePresets";
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
    // Repository authorization is separate from Google platform sign-in.
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
          Better Auth ใช้ Google สำหรับบัญชีแพลตฟอร์ม ส่วน GitHub ใช้เชื่อม Repository และ Deploy
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
                  <ShieldCheck size={15} /> Google:{" "}
                  {settings.googleLogin ? "Connected" : "Not connected"}
                </span>
              </div>
              <p className="workspace-account-help">บัญชีและเซสชันจัดการโดย Better Auth บนฐานข้อมูล PostgreSQL ของแพลตฟอร์ม</p>
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
                    false
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
        {phase === "ready" && <WorkspacePresets />}
      </section>
    </WorkspaceChrome>
  );
}
