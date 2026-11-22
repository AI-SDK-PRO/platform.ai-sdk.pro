"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, UserRound } from "lucide-react";
import WorkspaceChrome from "./WorkspaceChrome";
import type { PlatformSession } from "../lib/platform-types";

type Phase = "loading" | "signed-out" | "ready" | "error";

async function loadPlatformSession(): Promise<PlatformSession> {
  const response = await fetch("/api/platform/session", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return { user: null };
  return response.json() as Promise<PlatformSession>;
}

export default function WorkspaceAbout() {
  const [session, setSession] = useState<PlatformSession>({ user: null });
  const [phase, setPhase] = useState<Phase>("loading");
  const [displayName, setDisplayName] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  const refreshSession = useCallback(async () => {
    const current = await loadPlatformSession();
    setSession(current);
    if (!current.user) {
      setPhase("signed-out");
      return;
    }
    setPhase("ready");
  }, []);

  useEffect(() => {
    void refreshSession().catch(() => setPhase("error"));
  }, [refreshSession]);

  useEffect(() => {
    if (phase !== "ready") return;
    let active = true;
    void fetch("/api/platform/profile", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async response => {
        if (!response.ok) throw new Error("Profile unavailable.");
        return response.json();
      })
      .then(({ profile }) => {
        if (active) {
          setDisplayName(profile.displayName);
          setAboutMe(profile.aboutMe);
          setEmail(session.user?.email ?? "");
        }
      })
      .catch(() => {
        if (active)
          setError("อ่านโปรไฟล์จาก Supabase ไม่สำเร็จ กรุณาตรวจ migration");
      });
    return () => {
      active = false;
    };
  }, [phase, session.user?.email]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.user || saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/platform/profile", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, aboutMe }),
      });
      if (!response.ok) throw new Error("Could not save profile.");
      setNotice("บันทึกโปรไฟล์ใน Supabase แล้ว — แสดงเฉพาะใน Workspace ของคุณ");
    } catch {
      setError("บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setLogoutPending(true);
    try {
      const { authClient } = await import("../lib/auth-client");
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed.");
      window.location.assign("/login");
    } catch {
      setLogoutPending(false);
      setError("Sign out failed.");
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
      <section className="workspace-account-settings" aria-label="About me">
        <span className="workspace-account-kicker">
          WORKSPACE / เกี่ยวกับฉัน
        </span>
        <h1>โปรไฟล์ในพื้นที่แพลตฟอร์ม</h1>
        <p>
          เก็บชื่อที่แสดงและข้อความแนะนำตัวสั้น ๆ ใน Supabase Postgres
          ส่วนตัวของคุณเท่านั้น ไม่มีการเผยแพร่สาธารณะ และห้ามใส่ API key
          หรือรหัสผ่าน
        </p>

        {phase === "loading" && (
          <p role="status">
            <LoaderCircle className="workspace-spin" size={16} /> Loading…
          </p>
        )}
        {phase === "signed-out" && (
          <p>
            กรุณา <Link href="/login">เข้าสู่ระบบ</Link> ก่อนแก้โปรไฟล์
          </p>
        )}
        {phase === "error" && (
          <p role="alert">ไม่สามารถอ่านเซสชันได้ โปรดลองโหลดหน้าใหม่</p>
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

        {phase === "ready" && (
          <div className="workspace-account-card">
            <h2>
              <UserRound size={20} /> เกี่ยวกับฉัน
            </h2>
            <p className="workspace-account-help">{email}</p>
            <form className="workspace-account-form" onSubmit={saveProfile}>
              <label htmlFor="about-display-name">ชื่อที่แสดง</label>
              <input
                id="about-display-name"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                maxLength={120}
                autoComplete="name"
              />
              <label htmlFor="about-me-body">แนะนำตัวสั้น ๆ</label>
              <textarea
                id="about-me-body"
                rows={5}
                value={aboutMe}
                onChange={event => setAboutMe(event.target.value)}
                maxLength={500}
                placeholder="เช่น สร้าง agent สำหรับ docs, self-host บน VPS ของตัวเอง…"
              />
              <button
                type="submit"
                className="workspace-button workspace-button-primary"
                disabled={saving}
              >
                {saving ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
              </button>
            </form>
          </div>
        )}
      </section>
    </WorkspaceChrome>
  );
}
