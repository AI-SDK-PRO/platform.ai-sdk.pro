
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Github, KeyRound, Link2, LoaderCircle, LockKeyhole, MailCheck, ShieldCheck } from "lucide-react";
import WorkspaceChrome from "./WorkspaceChrome";
import FirebaseSyncPanel from "./FirebaseSyncPanel";
import { authClient } from "../lib/auth-client";
import { useFirebase } from "./FirebaseProvider";
import type { PlatformSession, PlatformStatus } from "../lib/platform-types";

type AccountStatus = { github:boolean; password:boolean; emailVerified:boolean; email:string };
type Phase = "loading" | "signed-out" | "ready" | "error";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {credentials:"same-origin",cache:"no-store",...init});
  if (!response.ok) throw new Error("Account API returned HTTP " + response.status);
  return response.json() as Promise<T>;
}

export default function WorkspaceAccount() {
  const [session, setSession] = useState<PlatformSession>({user:null});
  const [settings, setSettings] = useState<AccountStatus | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { user: firebaseUser, authError: firebaseAuthError, busy: providerBusy, linkGitHubSignIn, linkGoogleSignIn } = useFirebase();
  const [googleLoginLinked, setGoogleLoginLinked] = useState(false);
  const [githubLoginLinked, setGithubLoginLinked] = useState(false);
  const [passwordLinked, setPasswordLinked] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    setGoogleLoginLinked(firebaseUser.providerData.some(item => item.providerId === "google.com"));
    setGithubLoginLinked(firebaseUser.providerData.some(item => item.providerId === "github.com"));
    setPasswordLinked(firebaseUser.providerData.some(item => item.providerId === "password"));
  }, [firebaseUser]);

  async function linkGoogleLogin() {
    setError(""); setNotice("");
    const linked = await linkGoogleSignIn();
    if (linked) {
      setGoogleLoginLinked(true);
      setNotice("เพิ่ม Google เป็นวิธีเข้าสู่ระบบของบัญชีนี้แล้ว โดยคง Workspace เดิม");
    }
  }

  async function linkGithubLogin() {
    setError(""); setNotice("");
    const linked = await linkGitHubSignIn();
    if (linked) {
      setGithubLoginLinked(true);
      setNotice("เพิ่ม GitHub เป็นวิธีเข้าสู่ระบบของบัญชีนี้แล้ว โดยคง Workspace เดิม");
    }
  }

  async function addPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordBusy || passwordLinked || newPassword.length < 12 || newPassword.length > 128) return;
    setError(""); setNotice(""); setPasswordBusy(true);
    try {
      const [{ EmailAuthProvider, linkWithCredential }, { auth }] = await Promise.all([
        import("firebase/auth"), import("../lib/firebase"),
      ]);
      const current = auth.currentUser;
      if (!current?.email || !current.emailVerified) throw new Error("Sign in and verify your email first.");
      await linkWithCredential(current, EmailAuthProvider.credential(current.email, newPassword));
      setNewPassword("");
      setPasswordLinked(true);
      setNotice("ตั้งรหัสผ่านสำเร็จ ต่อไปใช้ Email / Password เข้าบัญชีนี้ได้");
    } catch {
      setError("ตั้งรหัสผ่านไม่ได้ กรุณาตรวจว่าบัญชีนี้ยังไม่มีรหัสผ่าน หรือเข้าสู่ระบบอีกครั้ง");
    } finally { setPasswordBusy(false); }
  }

  const refresh = useCallback(async () => {
    const [current, capabilities] = await Promise.all([
      json<PlatformSession>("/api/platform/session"),
      json<PlatformStatus>("/api/platform/status"),
    ]);
    setSession(current); setPlatform(capabilities);
    if (!current.user) { setPhase("signed-out"); return; }
    setSettings(await json<AccountStatus>("/api/platform/connected-accounts"));
    setPhase("ready");
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("linked") === "1") setNotice("GitHub connection returned. Checking linked account…");
    if (query.has("error")) setError("GitHub connection could not be completed. You may retry.");
    void refresh().catch(() => setPhase("error"));
  }, [refresh]);

  async function linkGithub() {
    if (busy || !platform?.githubConfigured) return;
    setBusy(true);setError("");setNotice("");
    try {
      const result = await authClient.linkSocial({
        provider: "github",
        callbackURL: "/workspace/account?linked=1",
      });
      if (result.error) throw new Error("Failed to begin GitHub linking.");
    } catch {
      setError("ไม่สามารถเริ่มเชื่อม GitHub ได้ กรุณาลองใหม่");
      setBusy(false);
    }
  }

  async function logout() {
    setLogoutPending(true);
    try {await authClient.signOut();window.location.assign("/login");}
    catch {setLogoutPending(false);setError("Sign out failed.");}
  }

  return <WorkspaceChrome user={session.user} onLogout={() => {void logout();}} logoutPending={logoutPending}>
    <section className="workspace-account-settings">
      <span className="workspace-account-kicker">WORKSPACE / ACCOUNT</span>
      <h1>บัญชีและการเชื่อมต่อ</h1>
      <p>Firebase เป็นบัญชีหลักของคุณ ส่วน GitHub ใช้เชื่อม Repository และ Deploy ภายในบัญชีเดียวกัน</p>
      {phase === "loading" && <p role="status"><LoaderCircle className="workspace-spin" size={16}/> Loading account…</p>}
      {phase === "signed-out" && <p>กรุณา <Link href="/login">เข้าสู่ระบบ</Link> ก่อน</p>}
      {phase === "error" && <p role="alert">ไม่สามารถอ่านบัญชีได้ โปรดลองโหลดหน้าใหม่</p>}
      {notice && <p role="status" className="workspace-account-success">{notice}</p>}
      {error && <p role="alert" className="workspace-account-error">{error}</p>}
      {firebaseAuthError && <p role="alert" className="workspace-account-error">{firebaseAuthError}</p>}
      {phase === "ready" && settings && <>
        <div className="workspace-account-card">
          <h2><ShieldCheck size={20}/> บัญชี ai-sdk.pro</h2>
          <p>{settings.email}</p>
          <div className="workspace-account-state">
            <span><MailCheck size={15}/> Email: {settings.emailVerified ? "Verified" : "Not verified"}</span>
            <span><LockKeyhole size={15}/> Google: {googleLoginLinked ? "Connected" : "Not connected"}</span>
            <span><Github size={15}/> GitHub Login: {githubLoginLinked ? "Connected" : "Not connected"}</span>
            <span><KeyRound size={15}/> Email / Password: {passwordLinked ? "Enabled" : "Not set"}</span>
          </div>
          {!googleLoginLinked && <button type="button" className="workspace-button workspace-button-secondary"
            disabled={providerBusy || !firebaseUser || !settings.emailVerified}
            onClick={() => { void linkGoogleLogin(); }}>
            Add Google as sign-in method
          </button>}
          {!githubLoginLinked && <button type="button" className="workspace-button workspace-button-secondary"
            disabled={providerBusy || !firebaseUser || !settings.emailVerified}
            onClick={() => { void linkGithubLogin(); }}>
            <Github size={15}/> Add GitHub as sign-in method
          </button>}
          {!passwordLinked && <form className="workspace-account-form" onSubmit={event => { void addPassword(event); }}>
            <label htmlFor="account-new-password">เพิ่มรหัสผ่านสำหรับบัญชีปัจจุบัน (อย่างน้อย 12 ตัวอักษร)</label>
            <input id="account-new-password" type="password" minLength={12} maxLength={128}
              autoComplete="new-password" value={newPassword} required
              onChange={event => setNewPassword(event.target.value)}
              placeholder="New password" />
            <button className="workspace-button workspace-button-secondary" type="submit"
              disabled={passwordBusy || !firebaseUser || !settings.emailVerified || newPassword.length < 12}>
              <KeyRound size={15}/> {passwordBusy ? "Saving…" : "Enable Email / Password login"}
            </button>
          </form>}
          <p className="workspace-account-help">เพิ่มวิธีเข้าสู่ระบบจากหน้านี้เพื่อให้ทุกวิธีใช้ Firebase UID และ Workspace เดียวกัน ระบบจะไม่รวมสองบัญชีอัตโนมัติจากอีเมลที่ตรงกัน</p>
          {!settings.emailVerified && <p>ยืนยันอีเมลก่อนเพิ่มวิธีเข้าสู่ระบบหรือเชื่อมบัญชีอื่น</p>}
        </div>
        <div className="workspace-account-card">
          <h2><Github size={20}/> สิทธิ์ GitHub Repository</h2>
          <p>อนุญาตให้แพลตฟอร์มอ่าน Repository สำหรับ Import และ Deploy โดยไม่สร้าง User ID ใหม่</p>
          <div className="workspace-account-state">
            <span><Link2 size={15}/> {settings.github ? "GitHub linked" : "GitHub not connected"}</span>
          </div>
          {<button type="button" className="workspace-button workspace-button-primary"
            disabled={busy || !platform?.githubConfigured || !settings.emailVerified}
            onClick={() => {void linkGithub();}}>
            <Github size={15}/> {settings.github ? "Reconnect repository access" : "Connect repository access"}
          </button>}
          {settings.github && <a className="workspace-button workspace-button-secondary"
            href={platform?.githubAppInstallUrl || "https://github.com/apps/ai-sdk-pro/installations/new"}
            target="_blank" rel="noreferrer">
            <Github size={15}/> Manage GitHub App installation
          </a>}
          <p className="workspace-account-help">
            {settings.github
              ? "GitHub OAuth เชื่อมแล้ว ติดตั้ง GitHub App เพื่อเลือก Repository ที่อนุญาต"
              : "การอนุญาต Repository แยกจาก GitHub Login ข้างบน เพื่อให้ผู้ใช้เลือกสิทธิ์ได้ชัดเจน"}
          </p>
        </div>

      </>}
      <FirebaseSyncPanel />
    </section>
  </WorkspaceChrome>;
}
