"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { syncFirebaseSession } from "../lib/firebase-session-client";
import { refreshBrowserSession } from "../lib/browser-session";
import "./native-auth.css";

type Mode = "sign-in" | "sign-up" | "forgot";

function messageForFirebaseError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่";
    case "auth/email-already-in-use":
      return "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบหรือใช้ลืมรหัสผ่าน";
    case "auth/invalid-email":
      return "รูปแบบอีเมลไม่ถูกต้อง";
    case "auth/operation-not-allowed":
      return "Email / Password ยังไม่เปิดใน Firebase Authentication โปรดตรวจ Sign-in providers";
    case "auth/weak-password":
      return "รหัสผ่านยังไม่ผ่านเงื่อนไขความปลอดภัย กรุณาใช้รหัสผ่านที่รัดกุมกว่าเดิม";
    case "auth/too-many-requests":
      return "มีการลองหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง";
    case "auth/network-request-failed":
      return "เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาตรวจเครือข่าย";
    case "auth/unauthorized-domain":
      return "Firebase ยังไม่ได้อนุญาตโดเมนของแพลตฟอร์มนี้";
    case "auth/internal-error":
      return "เกิดข้อผิดพลาดภายในระหว่างเชื่อม Firebase Authentication กรุณาตรวจ App Check / Authorized Domains";
    default:
      return error instanceof Error && error.message && !error.message.startsWith("Firebase:")
        ? error.message
        : "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลและลองใหม่";
  }
}

export default function EmailAuthPanel({
  enabled, initialMode = "sign-in",
}: {
  enabled: boolean;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationPending, setVerificationPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setError("");
    setMessage("");
  }, [initialMode]);

  useEffect(() => {
    // Unverified Firebase users have no Workspace session. They can verify
    // their address and refresh it here, including after a page reload.
    return onAuthStateChanged(auth, current => {
      if (current?.email && !current.emailVerified) {
        setVerificationPending(current.email);
        setEmail(current.email);
      } else {
        setVerificationPending(null);
      }
    });
  }, []);

  function setFormMode(next: Mode) {
    setMode(next);
    setMessage("");
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (mode === "sign-up") {
        if (name.trim().length < 2 || password.length < 12 || password.length > 128) {
          setError("กรุณากรอกชื่อและรหัสผ่าน 12–128 ตัวอักษร");
          return;
        }
        if (password !== confirmPassword) {
          setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
          return;
        }
        // The platform session and Neon mapping both use the Firebase UID.
        // Do not create a separate Better Auth email user.
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await updateProfile(credential.user, { displayName: name.trim() });
        setPassword("");
        setConfirmPassword("");
        setVerificationPending(normalizedEmail);
        try {
          await sendEmailVerification(credential.user);
          setMessage("สร้างบัญชีแล้ว กรุณาเปิดอีเมลเพื่อยืนยัน จากนั้นกลับมากดตรวจสอบการยืนยัน");
        } catch (verificationError) {
          setError(messageForFirebaseError(verificationError));
          setMessage("สร้างบัญชีแล้ว แต่ยังส่งอีเมลยืนยันไม่สำเร็จ กดส่งอีเมลยืนยันอีกครั้ง");
        }
        return;
      }
      if (mode === "forgot") {
        // Firebase sends its own password-reset action email. We never issue a
        // Better Auth token for a Firebase account.
        await sendPasswordResetEmail(auth, normalizedEmail);
        setMessage("หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ กรุณาตรวจ Inbox และ Spam");
        return;
      }
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await reload(credential.user);
      if (!credential.user.emailVerified) {
        setVerificationPending(normalizedEmail);
        setMessage("บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณายืนยันก่อนเข้า Workspace");
        return;
      }
      await syncFirebaseSession(credential.user, true);
      const session = await refreshBrowserSession({ reason: "login-check" });
      if (!session.signedIn) throw new Error("Workspace session was not established.");
      window.location.assign("/workspace");
    } catch (caught) {
      setError(messageForFirebaseError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const current = auth.currentUser;
      if (!current?.email || current.emailVerified || current.email !== verificationPending) {
        setError("กรุณาเข้าสู่ระบบด้วยอีเมลที่ต้องการยืนยันก่อน");
        return;
      }
      await sendEmailVerification(current);
      setMessage("ส่งอีเมลยืนยันอีกครั้งแล้ว กรุณาตรวจ Inbox และ Spam");
    } catch (caught) {
      setError(messageForFirebaseError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function checkVerification() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const current = auth.currentUser;
      if (!current) {
        setError("กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านอีกครั้ง");
        return;
      }
      await reload(current);
      if (!current.emailVerified) {
        setMessage("ยังไม่ได้รับการยืนยันอีเมล กรุณาเปิดลิงก์ที่ได้รับก่อน");
        return;
      }
      await syncFirebaseSession(current, true);
      const session = await refreshBrowserSession({ reason: "login-check" });
      if (!session.signedIn) throw new Error("Workspace session not ready.");
      setVerificationPending(null);
      window.location.assign("/workspace");
    } catch (caught) {
      setError(messageForFirebaseError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="native-auth">
      <div className="native-auth-switch" role="tablist" aria-label="วิธีใช้บัญชี">
        <button type="button" role="tab" aria-selected={mode === "sign-in"}
          className={mode === "sign-in" ? "active" : ""} onClick={() => setFormMode("sign-in")}>
          เข้าสู่ระบบ
        </button>
        <button type="button" role="tab" aria-selected={mode === "sign-up"}
          className={mode === "sign-up" ? "active" : ""} onClick={() => setFormMode("sign-up")}>
          สมัครสมาชิก
        </button>
      </div>
      {enabled ? (
        <>
          <form className="native-auth-form" onSubmit={event => { void submit(event); }}>
            {mode === "sign-up" && <>
              <label htmlFor="auth-name">ชื่อที่แสดง</label>
              <input id="auth-name" value={name} autoComplete="name" required minLength={2} maxLength={80}
                onChange={event => setName(event.target.value)} placeholder="Your name" />
            </>}
            <label htmlFor="auth-email">อีเมล</label>
            <input id="auth-email" type="email" value={email} required autoComplete="email" maxLength={254}
              onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
            {mode !== "forgot" && <>
              <label htmlFor="auth-password">รหัสผ่าน</label>
              <input id="auth-password" type="password" required minLength={12} maxLength={128}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                value={password} onChange={event => setPassword(event.target.value)}
                placeholder="อย่างน้อย 12 ตัวอักษร" />
            </>}
            {mode === "sign-up" && <>
              <label htmlFor="auth-confirm-password">ยืนยันรหัสผ่าน</label>
              <input id="auth-confirm-password" type="password" required minLength={12} maxLength={128}
                autoComplete="new-password" value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                placeholder="Confirm your password" />
            </>}
            {error && <p role="alert" className="native-auth-error">{error}</p>}
            {message && <p role="status" className="native-auth-success">{message}</p>}
            <button type="submit" className="native-auth-submit" disabled={busy}>
              {busy ? <LoaderCircle className="auth-spin" size={17} /> : <Mail size={17} />}
              {mode === "sign-up" ? "สร้างบัญชี ai-sdk.pro" :
                mode === "forgot" ? "ส่งลิงก์ตั้งรหัสผ่าน" : "เข้าสู่ระบบด้วยอีเมล"}
              <ArrowRight size={16} />
            </button>
            <div className="native-auth-foot">
              {mode === "forgot" ? (
                <button type="button" onClick={() => setFormMode("sign-in")}>กลับไปเข้าสู่ระบบ</button>
              ) : (
                <button type="button" onClick={() => setFormMode("forgot")}>ลืมรหัสผ่าน?</button>
              )}
            </div>
            {mode === "sign-up" && <p className="native-auth-hint"><ShieldCheck size={14} />
              สมัครด้วยอีเมลได้โดยไม่ต้องเชื่อม GitHub หลังยืนยันแล้วจึงเพิ่ม GitHub ใน Workspace ได้</p>}
          </form>
          {verificationPending && <div className="native-auth-verification" role="status">
            <p>รอยืนยันอีเมล: <strong>{verificationPending}</strong></p>
            <button type="button" disabled={busy} onClick={() => { void checkVerification(); }}>
              ตรวจสอบการยืนยันอีเมล
            </button>
            <button type="button" disabled={busy} onClick={() => { void resend(); }}>
              ส่งอีเมลยืนยันอีกครั้ง
            </button>
          </div>}
        </>
      ) : (
        <p className="native-auth-unavailable" role="status">ระบบสมัครสมาชิกยังไม่พร้อมใช้งาน</p>
      )}
    </div>
  );
}
