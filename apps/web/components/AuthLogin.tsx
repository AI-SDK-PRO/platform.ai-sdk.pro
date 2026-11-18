"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import SiteHeader from "./SiteHeader";
import EmailAuthPanel from "./EmailAuthPanel";
import { useFirebase } from "./FirebaseProvider";
import { refreshBrowserSession } from "../lib/browser-session";

export default function AuthLogin({initialMode = "sign-in"}: {initialMode?: "sign-in" | "sign-up"}) {
  const router = useRouter();
  const { user, authReady, busy, authError, signInWithGoogle } = useFirebase();
  useEffect(() => {
    if (!user || !authReady || authError) return;
    let active = true;
    void refreshBrowserSession({ reason: "login-check" }).then(session => {
      if (active && session.signedIn) router.replace("/");
    }).catch(() => {});
    return () => { active = false; };
  }, [user, authReady, authError, router]);
  return <><SiteHeader /><main className="auth-page"><div className="auth-stage">
    <section className="auth-card" aria-labelledby="login-title">
      <div className="auth-card-mark" aria-hidden="true"><ShieldCheck size={25} strokeWidth={1.8}/></div>
      <span className="auth-eyebrow">REPOSITORY WORKSPACE</span>
      <h1 id="login-title">Your ai-sdk.pro account.</h1>
      <p className="auth-intro">เข้าสู่ระบบด้วย Google เพื่อใช้ Workspace เดียวกันทั้งเว็บ แชต และ Deploy เชื่อม GitHub เพิ่มได้ภายหลังเมื่อต้องการนำเข้า Repository</p>
      {authError && <div className="auth-alert" role="alert"><AlertCircle size={16}/><span>{authError}</span></div>}
      <button type="button" className="auth-github-button" disabled={!authReady || busy}
        onClick={() => { void signInWithGoogle(); }}>
        {busy ? <LoaderCircle className="auth-spin" size={17}/> : <span aria-hidden="true">G</span>}
        {busy ? "กำลังเข้าสู่ระบบ…" : "Continue with Google"}
      </button>
      {!authReady && <p className="auth-status" role="status">กำลังเชื่อมบัญชี…</p>}
      {process.env.NEXT_PUBLIC_FIREBASE_EMAIL_AUTH_ENABLED === "true" && <EmailAuthPanel enabled initialMode={initialMode}/>}
      <div className="auth-trust-row"><ShieldCheck size={15}/><span>Firebase ดูแลการเข้าสู่ระบบ ส่วน GitHub เชื่อมกับบัญชีนี้เพื่อ Import และ Deploy</span></div>
      <p className="auth-privacy">โปรเจ็กต์และประวัติ Deploy ใช้บัญชี Workspace เดิม ข้อมูลส่วนตัวใน Firestore แยกตามผู้ใช้</p>
    </section>
  </div></main></>;
}
