"use client";
import Link from "next/link";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "../lib/auth-paths";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Github, LoaderCircle } from "lucide-react";
import EmailAuthPanel from "./EmailAuthPanel";
import { authClient } from "../lib/auth-client";
import { refreshBrowserSession } from "../lib/browser-session";
import "./auth-simple.css";

export default function AuthLogin({
  initialMode = "sign-in",
  platformRegistration = false,
}: {
  initialMode?: "sign-in" | "sign-up";
  platformRegistration?: boolean;
}) {
  const router = useRouter();
  const [oauthStarted, setOauthStarted] = useState(false);
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const authReady = !isPending;
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  async function social(provider: "google" | "github") {
    setOauthStarted(true);
    setBusy(true);
    setAuthError("");
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin + "/",
      });
      if (result.error) {
        const label = provider === "google" ? "Google" : "GitHub";
        setAuthError(result.error.status === 503
          ? "ระบบบัญชีของแพลตฟอร์มยังไม่พร้อมใช้งาน"
          : result.error.code === "provider_disabled"
            ? "ระบบยังไม่ได้เปิดการเข้าสู่ระบบผ่าน " + label
            : "เริ่มเข้าสู่ระบบผ่าน " + label + " ไม่สำเร็จ ใช้อีเมลและรหัสผ่านได้");
      }
    } catch {
      setAuthError("ติดต่อบริการเข้าสู่ระบบของแพลตฟอร์มไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  // Restoring a session is not an explicit login attempt (see PR #13).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("auth_error");
    setEmailConfirmed(params.get("email_confirmed") === "1");
    if (error === "email_link_invalid" || error === "oauth_failed") {
      setOauthStarted(true);
      setAuthError(error === "email_link_invalid"
        ? "ลิงก์ยืนยันอีเมลหมดอายุหรือถูกใช้แล้ว ขอส่งลิงก์ใหม่จากฟอร์มเข้าสู่ระบบ"
        : "ยืนยันการเข้าสู่ระบบจากผู้ให้บริการไม่ได้ กรุณาเริ่มจากหน้านี้");
    }
    if (error || params.has("email_confirmed")) {
      params.delete("auth_error");
      params.delete("email_confirmed");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? "?" + query : ""));
    }
  }, [initialMode]);

  useEffect(() => {
    if (!user || !user.emailVerified || !authReady) return;
    let active = true;
    void refreshBrowserSession({ reason: "login-check" })
      .then(session => {
        if (active && session.signedIn) router.replace("/");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, authReady, router]);

  return (
    <main className="auth-page auth-page--simple">
      <div className="auth-stage">
        <section
          className="auth-card auth-card--simple"
          aria-labelledby="login-title"
        >
          <Link
            className="simple-auth-brand"
            href="/"
            aria-label="ai-sdk.pro home"
          >
            ai-sdk<span>.pro</span>
          </Link>
          <h1 id="login-title">
            {platformRegistration ? "Create your AI SDK Pro account" : initialMode === "sign-up" ? "Create your account" : "Welcome back"}
          </h1>
          {oauthStarted && authError && (
            <div className="auth-alert" role="alert">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}
          {emailConfirmed && <p role="status">ยืนยันอีเมลแล้ว เข้าสู่ระบบด้วยอีเมลและรหัสผ่านของคุณได้เลย</p>}
          {platformRegistration ? (
            <p>
              Your name and email identify your AI SDK Pro account and Workspace.
              Verify your email before signing in.
            </p>
          ) : (
            <>
              <div className="simple-auth-providers">
                <button
                  type="button"
                  className="auth-github-button"
                  disabled={!authReady || busy}
                  onClick={() => {
                    void social("google");
                  }}
                >
                  {busy ? (
                    <LoaderCircle className="auth-spin" size={18} />
                  ) : (
                    <span aria-hidden="true" className="simple-google-mark">
                      G
                    </span>
                  )}
                  <span>Continue with Google</span>
                </button>
                <button
                  type="button"
                  className="auth-github-button"
                  disabled={!authReady || busy}
                  onClick={() => {
                    void social("github");
                  }}
                >
                  {busy ? (
                    <LoaderCircle className="auth-spin" size={18} />
                  ) : (
                    <Github size={20} aria-hidden="true" />
                  )}
                  <span>Continue with GitHub</span>
                </button>
              </div>
              <div className="simple-auth-divider" role="separator">
                <span>OR</span>
              </div>
            </>
          )}
          <EmailAuthPanel enabled initialMode={initialMode} />
          {!authReady && (
            <p className="auth-status" role="status">
              Preparing secure sign-in…
            </p>
          )}
          <p className="simple-auth-footer">
            {initialMode === "sign-up" ? (
              <>
                Already have an account? <Link href={SIGN_IN_PATH}>Log in</Link>
              </>
            ) : (
              <>
                New to ai-sdk.pro? <Link href={SIGN_UP_PATH}>Create an account</Link>
              </>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
