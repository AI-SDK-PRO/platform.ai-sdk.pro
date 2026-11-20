"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Github, LoaderCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useFirebase } from "./FirebaseProvider";
import { refreshBrowserSession } from "../lib/browser-session";
import "./auth-simple.css";

// Firebase Auth initializes browser-only modules; never evaluate the email UI in SSR.
const EmailAuthPanel = dynamic(() => import("./EmailAuthPanel"), { ssr: false });

export default function AuthLogin({ initialMode = "sign-in" }: { initialMode?: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const { user, authReady, busy, authError, signInWithGoogle, signInWithGitHub } = useFirebase();

  useEffect(() => {
    if (!user || !authReady || authError) return;
    let active = true;
    void refreshBrowserSession({ reason: "login-check" }).then(session => {
      if (active && session.signedIn) router.replace("/workspace");
    }).catch(() => {});
    return () => { active = false; };
  }, [user, authReady, authError, router]);

  return (
    <main className="auth-page auth-page--simple">
      <div className="auth-stage">
        <section className="auth-card auth-card--simple" aria-labelledby="login-title">
          <Link className="simple-auth-brand" href="/" aria-label="ai-sdk.pro home">ai-sdk<span>.pro</span></Link>
          <h1 id="login-title">{initialMode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
          {authError && <div className="auth-alert" role="alert"><AlertCircle size={16} /><span>{authError}</span></div>}
          <div className="simple-auth-providers">
            <button type="button" className="auth-github-button" disabled={!authReady || busy}
              onClick={() => { void signInWithGoogle(); }}>
              {busy ? <LoaderCircle className="auth-spin" size={18} /> : <span aria-hidden="true" className="simple-google-mark">G</span>}
              <span>Continue with Google</span>
            </button>
            <button type="button" className="auth-github-button" disabled={!authReady || busy}
              onClick={() => { void signInWithGitHub(); }}>
              {busy ? <LoaderCircle className="auth-spin" size={18} /> : <Github size={20} aria-hidden="true" />}
              <span>Continue with GitHub</span>
            </button>
          </div>
          <div className="simple-auth-divider" role="separator"><span>OR</span></div>
          <EmailAuthPanel enabled initialMode={initialMode} />
          {!authReady && <p className="auth-status" role="status">Preparing secure sign-in…</p>}
          <p className="simple-auth-footer">
            {initialMode === "sign-up" ? <>Already have an account? <Link href="/login">Log in</Link></> :
              <>New to ai-sdk.pro? <Link href="/signup">Create an account</Link></>}
          </p>
        </section>
      </div>
    </main>
  );
}
