"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Github, LoaderCircle } from "lucide-react";
import EmailAuthPanel from "./EmailAuthPanel";
import { authClient } from "../lib/auth-client";
import { authErrorCode, describeAuthError } from "../lib/auth-error-messages";
import { refreshBrowserSession } from "../lib/browser-session";
import "./auth-simple.css";

export default function AuthLogin({
  initialMode = "sign-in",
}: {
  initialMode?: "sign-in" | "sign-up";
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
        callbackURL: window.location.origin + "/workspace",
        // GitHub omits the email unless the token carries this scope, which is
        // what produced the bare /login?error=email_not_found redirect.
        ...(provider === "github" ? { scopes: ["user:email"] } : {}),
      });
      if (result.error)
        setAuthError(
          describeAuthError(authErrorCode(result.error)) ??
            "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจการเปิดใช้งานผู้ให้บริการใน Neon Auth"
        );
    } catch {
      setAuthError("เชื่อมต่อระบบเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  // Restoring a session is not an explicit login attempt (see PR #13).
  useEffect(() => {
    setOauthStarted(false);
  }, [initialMode]);

  // Neon Auth redirects failed OAuth/verification callbacks back here with
  // ?error=<code>. Read it on the client so the page stays statically renderable.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    const message = describeAuthError(code);
    if (!message) return;
    setOauthStarted(true);
    setAuthError(message);
  }, []);

  useEffect(() => {
    if (!user || !user.emailVerified || !authReady) return;
    let active = true;
    void refreshBrowserSession({ reason: "login-check" })
      .then(session => {
        if (active && session.signedIn) router.replace("/workspace");
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
            {initialMode === "sign-up" ? "Create your account" : "Welcome back"}
          </h1>
          {authError && (
            <div className="auth-alert" role="alert">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}
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
                New to ai-sdk.pro? <Link href="/signup">Create an account</Link>
              </>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
