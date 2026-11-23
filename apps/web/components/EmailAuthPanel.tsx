"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { refreshBrowserSession } from "../lib/browser-session";
import "./native-auth.css";

type Mode = "sign-in" | "sign-up" | "forgot";

class AuthRequestError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function messageForAuthError(error: unknown): string {
  const status = error instanceof AuthRequestError ? error.status : undefined;
  if (status === 403) {
    return "อีเมลนี้ยังไม่ได้ยืนยัน กรุณาเปิดลิงก์ในอีเมลหรือกดส่งอีเมลยืนยันอีกครั้งด้านล่าง";
  }
  if (status === 401) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }
  if (status === 429) {
    return "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  }
  if (status === 503) {
    return "ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ กรุณาตรวจสอบตัวแปรสภาพแวดล้อม Supabase และฐานข้อมูล";
  }
  return "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง";
}

function requireSuccess(result: {
  error: { status?: number; message?: string } | null;
}) {
  if (result.error) {
    throw new AuthRequestError(
      result.error.message || "Authentication failed.",
      result.error.status
    );
  }
}

export default function EmailAuthPanel({
  enabled,
  initialMode = "sign-in",
}: {
  enabled: boolean;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationPending, setVerificationPending] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setError("");
    setMessage("");
  }, [initialMode]);

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
        if (
          name.trim().length < 2 ||
          password.length < 12 ||
          password.length > 128
        ) {
          setError("กรุณากรอกชื่อและรหัสผ่าน 12–128 ตัวอักษร");
          return;
        }
        if (password !== confirmPassword) {
          setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
          return;
        }
        requireSuccess(
          await authClient.signUp.email({
            email: normalizedEmail,
            password,
            name: name.trim(),
            callbackURL: window.location.origin + "/",
          })
        );
        setPassword("");
        setConfirmPassword("");
        setVerificationPending(normalizedEmail);
        setMessage(
          "สร้างบัญชีแล้ว กรุณาเปิดอีเมลยืนยัน จากนั้นเข้าสู่ระบบเพื่อเข้า Workspace"
        );
        return;
      }
      if (mode === "forgot") {
        requireSuccess(
          await authClient.requestPasswordReset({
            email: normalizedEmail,
            redirectTo: window.location.origin + "/reset-password",
          })
        );
        setMessage(
          "หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ กรุณาตรวจ Inbox และ Spam"
        );
        return;
      }
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });
      if (result.error) {
        if (result.error.status === 403)
          setVerificationPending(normalizedEmail);
        requireSuccess(result);
      }
      const session = await refreshBrowserSession({ reason: "login-check" });
      if (!session.signedIn)
        throw new Error("Workspace session was not established.");
      window.location.assign("/");
    } catch (caught) {
      setError(messageForAuthError(caught));
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
      if (!verificationPending) return;
      requireSuccess(
        await authClient.sendVerificationEmail({
          email: verificationPending,
          callbackURL: window.location.origin + "/",
        })
      );
      setMessage("ส่งอีเมลยืนยันอีกครั้งแล้ว กรุณาตรวจ Inbox และ Spam");
    } catch (caught) {
      setError(messageForAuthError(caught));
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
      const session = await refreshBrowserSession({ reason: "login-check" });
      if (!session.signedIn) {
        setMessage(
          "หากยืนยันอีเมลแล้ว กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านอีกครั้ง"
        );
        return;
      }
      setVerificationPending(null);
      window.location.assign("/");
    } catch (caught) {
      setError(messageForAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="native-auth">
      <div
        className="native-auth-switch"
        role="tablist"
        aria-label="วิธีใช้บัญชี"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-in"}
          className={mode === "sign-in" ? "active" : ""}
          onClick={() => setFormMode("sign-in")}
        >
          เข้าสู่ระบบ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-up"}
          className={mode === "sign-up" ? "active" : ""}
          onClick={() => setFormMode("sign-up")}
        >
          สมัครสมาชิก
        </button>
      </div>
      {enabled ? (
        <>
          <form
            className="native-auth-form"
            onSubmit={event => {
              void submit(event);
            }}
          >
            {mode === "sign-up" && (
              <>
                <label htmlFor="auth-name">ชื่อที่แสดง</label>
                <input
                  id="auth-name"
                  value={name}
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  onChange={event => setName(event.target.value)}
                  placeholder="Your name"
                />
              </>
            )}
            <label htmlFor="auth-email">อีเมล</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              required
              autoComplete="email"
              maxLength={254}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            {mode !== "forgot" && (
              <>
                <label htmlFor="auth-password">รหัสผ่าน</label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={mode === "sign-up" ? 12 : 1}
                  maxLength={128}
                  autoComplete={
                    mode === "sign-up" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder={
                    mode === "sign-up"
                      ? "อย่างน้อย 12 ตัวอักษร"
                      : "รหัสผ่านของคุณ"
                  }
                />
              </>
            )}
            {mode === "sign-up" && (
              <>
                <label htmlFor="auth-confirm-password">ยืนยันรหัสผ่าน</label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  placeholder="Confirm your password"
                />
              </>
            )}
            {error && (
              <p role="alert" className="native-auth-error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="native-auth-success">
                {message}
              </p>
            )}
            <button
              type="submit"
              className="native-auth-submit"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="auth-spin" size={17} />
              ) : (
                <Mail size={17} />
              )}
              {mode === "sign-up"
                ? "สร้างบัญชี ai-sdk.pro"
                : mode === "forgot"
                  ? "ส่งลิงก์ตั้งรหัสผ่าน"
                  : "เข้าสู่ระบบด้วยอีเมล"}
              <ArrowRight size={16} />
            </button>
            <div className="native-auth-foot">
              {mode === "forgot" ? (
                <button type="button" onClick={() => setFormMode("sign-in")}>
                  กลับไปเข้าสู่ระบบ
                </button>
              ) : (
                <button type="button" onClick={() => setFormMode("forgot")}>
                  ลืมรหัสผ่าน?
                </button>
              )}
            </div>
            {mode === "sign-up" && (
              <p className="native-auth-hint">
                <ShieldCheck size={14} />
                สมัครด้วยอีเมลได้โดยไม่ต้องเชื่อม GitHub หลังยืนยันแล้วจึงเพิ่ม
                GitHub ใน Workspace ได้
              </p>
            )}
          </form>
          {verificationPending && (
            <div className="native-auth-verification" role="status">
              <p>
                รอยืนยันอีเมล: <strong>{verificationPending}</strong>
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void checkVerification();
                }}
              >
                ตรวจสอบการยืนยันอีเมล
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void resend();
                }}
              >
                ส่งอีเมลยืนยันอีกครั้ง
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="native-auth-unavailable" role="status">
          ระบบสมัครสมาชิกยังไม่พร้อมใช้งาน
        </p>
      )}
    </div>
  );
}
