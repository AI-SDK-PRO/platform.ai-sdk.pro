"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { LoaderCircle, UserRound } from "lucide-react";
import WorkspaceChrome from "./WorkspaceChrome";
import { useFirebase } from "./FirebaseProvider";
import {
  buildAccountPayload,
  db,
  FIREBASE_LIMITS,
  handleFirestoreError,
  OperationType,
} from "../lib/firebase";
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
  const { user: firebaseUser, authReady } = useFirebase();
  const [session, setSession] = useState<PlatformSession>({ user: null });
  const [phase, setPhase] = useState<Phase>("loading");
  const [displayName, setDisplayName] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  if (asyncError) {
    throw asyncError;
  }

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
    if (!authReady || !firebaseUser || phase !== "ready") {
      return;
    }
    const path = `users/${firebaseUser.uid}/private/account`;
    const ref = doc(db, "users", firebaseUser.uid, "private", "account");
    const unsubscribe = onSnapshot(
      ref,
      snapshot => {
        if (!snapshot.exists()) {
          setDisplayName(firebaseUser.displayName ?? session.user?.name ?? "");
          setAboutMe("");
          setEmail(firebaseUser.email ?? session.user?.email ?? "");
          return;
        }
        const data = snapshot.data();
        setDisplayName(String(data.displayName ?? firebaseUser.displayName ?? ""));
        setAboutMe(String(data.aboutMe ?? ""));
        setEmail(String(data.email ?? firebaseUser.email ?? ""));
      },
      firestoreError => {
        try {
          handleFirestoreError(firestoreError, OperationType.GET, path);
        } catch (wrapped) {
          setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
    return () => unsubscribe();
  }, [authReady, firebaseUser, phase, session.user?.email, session.user?.name]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseUser || saving || !firebaseUser.emailVerified) return;
    setSaving(true);
    setNotice("");
    setError("");
    const path = `users/${firebaseUser.uid}/private/account`;
    try {
      const payload = buildAccountPayload({
        uid: firebaseUser.uid,
        displayName,
        aboutMe,
        email: firebaseUser.email ?? email,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "users", firebaseUser.uid, "private", "account"), payload, {
        merge: true,
      });
      setNotice("บันทึกโปรไฟล์แล้ว — แสดงเฉพาะใน Workspace ของคุณ");
    } catch (saveError) {
      if (
        saveError instanceof Error &&
        saveError.message.includes("Missing or insufficient permissions")
      ) {
        try {
          handleFirestoreError(saveError, OperationType.WRITE, path);
        } catch (wrapped) {
          setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      } else {
        setError(saveError instanceof Error ? saveError.message : "Could not save profile.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setLogoutPending(true);
    try {
      const { authClient } = await import("../lib/auth-client");
      await authClient.signOut();
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
        <span className="workspace-account-kicker">WORKSPACE / เกี่ยวกับฉัน</span>
        <h1>โปรไฟล์ในพื้นที่แพลตฟอร์ม</h1>
        <p>
          เก็บชื่อที่แสดงและข้อความแนะนำตัวสั้น ๆ ใน Firestore ส่วนตัวของคุณเท่านั้น
          ไม่มีการเผยแพร่สาธารณะ และห้ามใส่ API key หรือรหัสผ่าน
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
            {!firebaseUser?.emailVerified && (
              <p className="workspace-account-error">
                ยืนยันอีเมลใน Firebase ก่อนบันทึกโปรไฟล์
              </p>
            )}
            <form className="workspace-account-form" onSubmit={saveProfile}>
              <label htmlFor="about-display-name">ชื่อที่แสดง</label>
              <input
                id="about-display-name"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                maxLength={FIREBASE_LIMITS.displayNameMaxLength}
                autoComplete="name"
              />
              <label htmlFor="about-me-body">แนะนำตัวสั้น ๆ</label>
              <textarea
                id="about-me-body"
                rows={5}
                value={aboutMe}
                onChange={event => setAboutMe(event.target.value)}
                maxLength={FIREBASE_LIMITS.aboutMeMaxLength}
                placeholder="เช่น สร้าง agent สำหรับ docs, self-host บน VPS ของตัวเอง…"
              />
              <button
                type="submit"
                className="workspace-button workspace-button-primary"
                disabled={saving || !firebaseUser?.emailVerified}
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