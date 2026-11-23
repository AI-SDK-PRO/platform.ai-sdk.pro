"use client";
import Link from "next/link";
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
        setAuthError(
          result.error.status === 503
            ? "ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ กรุณาตรวจสอบตัวแปรสภาพแวดล้อม Supabase บนเซิร์ฟเวอร์"
            : "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจการเปิดใช้งานผู้ให้บริการและ Redirect URL ใน Supabase Auth"
        );
      }
    } catch {
      setAuthError("เชื่อมต่อระบบเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  // Restoring a session is not an explicit login attempt (see PR #13).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_error") === "1") {
      setOauthStarted(true);
      setAuthError("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      setOauthStarted(false);
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
                Already have an account? <Link href="/login">Log in</Link>
              </>
            ) : (
              <>
                New to ai-sdk.pro? <Link href="/oauth/consent">Create an account</Link>
              </>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
