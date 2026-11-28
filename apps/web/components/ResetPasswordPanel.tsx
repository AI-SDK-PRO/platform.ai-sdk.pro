"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
import { Brand } from "@aisdkpro/ui";
import "./native-auth.css";

export default function ResetPasswordPanel() {
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    // Keep the single-use action code out of history and referrers.
    window.history.replaceState({}, "", "/reset-password");
    if (!token || params.has("error")) {
      setInvalid(true);
      setChecking(false);
      return;
    }
    setCode(token);
    setChecking(false);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm || password.length < 12 || password.length > 128) {
      setMessage("รหัสผ่านต้องตรงกันและมีความยาว 12–128 ตัวอักษร");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.resetPassword({
        token: code,
        newPassword: password,
      });
      if (result.error) throw new Error("Reset failed.");
      setPassword("");
      setConfirm("");
      setCode("");
      setDone(true);
      setMessage("ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กรุณาเข้าสู่ระบบ");
    } catch {
      setMessage("ลิงก์หมดอายุหรือใช้ไม่ได้แล้ว กรุณาขอลิงก์ใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Brand />
        <Link href="/login">Back to login</Link>
      </header>
      <section className="auth-stage">
        <div className="auth-card">
          <h1>ตั้งรหัสผ่านใหม่</h1>
          {checking ? (
            <p role="status">กำลังตรวจสอบลิงก์…</p>
          ) : invalid ? (
            <p role="alert">
              ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว{" "}
              <Link href="/login">กลับไปขอลิงก์ใหม่</Link>
            </p>
          ) : done ? (
            <p role="status">
              {message} <Link href="/login">Sign in</Link>
            </p>
          ) : (
            <form
              className="native-auth-form"
              onSubmit={event => {
                void submit(event);
              }}
            >
              <label htmlFor="new-password">รหัสผ่านใหม่</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <label htmlFor="confirm-password">ยืนยันรหัสผ่าน</label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
              {message && (
                <p role="alert" className="native-auth-error">
                  {message}
                </p>
              )}
              <button
                className="native-auth-submit"
                type="submit"
                disabled={busy}
              >
                {busy ? "กำลังตรวจสอบ…" : "บันทึกรหัสผ่าน"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
