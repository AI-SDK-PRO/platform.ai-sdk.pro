"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { syncFirebaseSession, clearFirebaseSession, FirebaseSessionSyncError } from "../lib/firebase-session-client";
import { getBrowserSessionSnapshot, refreshBrowserSession } from "../lib/browser-session";
import FirebaseErrorBoundary from "./FirebaseErrorBoundary";

type FirebaseSDK = {
  authMod: typeof import("firebase/auth");
  fb: typeof import("../lib/firebase");
};

function safeAuthError(error: unknown): string {
  if (error instanceof FirebaseSessionSyncError) {
    switch (error.message) {
      case "Verify your Firebase email before signing in.":
        return "กรุณายืนยันอีเมลของคุณก่อนเข้าสู่ Workspace";
      case "Your sign-in provider did not supply an email address.":
        return "ผู้ให้บริการไม่ได้ส่งอีเมลกลับมา กรุณาตั้งค่าอีเมลหลักในบัญชีผู้ให้บริการแล้วลองใหม่";
      case "Sign in to the existing workspace before linking this Firebase account.":
        return "อีเมลนี้มีบัญชี Workspace อยู่แล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิมก่อนแล้วค่อยเชื่อมบัญชีใน Account Settings";
      case "Origin is not allowed.":
        return "โดเมนนี้ยังไม่ได้รับอนุญาตให้สร้าง Workspace Session (403 Origin is not allowed)";
      case "Platform setup is required.":
        return "ระบบฐานข้อมูลหรือ Session ของแพลตฟอร์มยังตั้งค่าไม่ครบถ้วน";
      default:
        return error.message;
    }
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  switch (code) {
    case "auth/popup-blocked":
      return "เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต Pop-ups สำหรับเว็บไซต์นี้ แล้วลองใหม่";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "ปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จ";
    case "auth/account-exists-with-different-credential":
      return "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิมก่อน แล้วเพิ่มช่องทางนี้ที่ Account Settings เพื่อใช้บัญชีเดียวกัน";
    case "auth/credential-already-in-use":
      return "บัญชีนี้เชื่อมกับผู้ใช้อื่นอยู่แล้ว ระบบจะไม่รวมบัญชีให้อัตโนมัติ";
    case "auth/provider-already-linked":
      return "ช่องทางนี้เชื่อมกับบัญชีของคุณแล้ว";
    case "auth/operation-not-allowed":
      return "ช่องทางนี้ยังไม่เปิดใช้งานใน Firebase Authentication กรุณาตรวจ Provider Settings";
    case "auth/unauthorized-domain":
      return "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication";
    case "auth/internal-error":
      return "เกิดข้อผิดพลาดภายในระหว่างเชื่อม Firebase Authentication (auth/internal-error) กรุณาตรวจการตั้งค่า OAuth Provider, App Check และ Authorized Domains";
    case "auth/network-request-failed":
      return "เชื่อมต่อระบบล็อกอินไม่ได้ กรุณาตรวจเครือข่ายแล้วลองใหม่";
    case "auth/requires-recent-login":
      return "กรุณาออกจากระบบแล้วเข้าสู่ระบบอีกครั้ง ก่อนเชื่อมช่องทางใหม่";
    default:
      return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่หรือตรวจการตั้งค่า Firebase";
  }
}

export interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  connected: boolean | null;
  busy: boolean;
  authError: string;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  linkGitHubSignIn: () => Promise<boolean>;
  linkGoogleSignIn: () => Promise<boolean>;
  signOutFirebase: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  connected: null,
  busy: false,
  authError: "",
  clearAuthError: () => undefined,
  signInWithGoogle: async () => undefined,
  signInWithGitHub: async () => undefined,
  linkGitHubSignIn: async () => false,
  linkGoogleSignIn: async () => false,
  signOutFirebase: async () => undefined,
});

export function useFirebase() {
  return useContext(FirebaseContext);
}

export default function FirebaseProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const needsSession = pathname.startsWith("/workspace") || pathname === "/deploy";
  const needsSessionRef = useRef(needsSession);
  needsSessionRef.current = needsSession;
  const sdkRef = useRef<FirebaseSDK | null>(null);
  const hadFirebaseUserRef = useRef(false);
  const actionInFlightRef = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const clearAuthError = useCallback(() => {
    setAuthError("");
  }, []);

  useEffect(() => {
    setAuthError("");
  }, [pathname]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    void Promise.all([
      import("firebase/auth"),
      import("firebase/firestore"),
      import("../lib/firebase"),
    ])
      .then(([authMod, firestoreMod, fb]) => {
        if (!active) return;
        fb.ensureAppCheck();
        // Load the SDK before enabling buttons. Starting OAuth after awaiting
        // a dynamic import inside the click handler can trigger popup blocking.
        sdkRef.current = { authMod, fb };
        void fb.testConnection().then(value => {
          if (active) setConnected(value);
        });

        unsubscribe = authMod.onAuthStateChanged(fb.auth, async nextUser => {
          if (!active) return;
          setAuthReady(false);
          try {
            if (!nextUser || !nextUser.emailVerified) {
              const shouldClearServerSession =
                hadFirebaseUserRef.current || getBrowserSessionSnapshot().signedIn;
              hadFirebaseUserRef.current = Boolean(nextUser);
              if (shouldClearServerSession) {
                await clearFirebaseSession().catch(() => undefined);
              }
              await refreshBrowserSession({ reason: "login-check" }).catch(() => undefined);
              if (active) setUser(nextUser);
              return;
            }

            hadFirebaseUserRef.current = true;
            if (!actionInFlightRef.current) {
              await syncFirebaseSession(nextUser);
              await refreshBrowserSession({ reason: "login-check" });
            }
            if (active) setUser(nextUser);
          } catch (caught) {
            if (active) {
              setUser(nextUser);
              if (needsSessionRef.current && nextUser?.emailVerified) {
                setAuthError(safeAuthError(caught));
              }
            }
          } finally {
            if (active) setAuthReady(true);
          }

          if (nextUser?.email && nextUser.emailVerified) {
            const payload = fb.buildAccountPayload({
              uid: nextUser.uid,
              displayName: nextUser.displayName,
              email: nextUser.email,
              updatedAt: firestoreMod.serverTimestamp(),
            });
            void firestoreMod
              .setDoc(
                firestoreMod.doc(fb.db, "users", nextUser.uid, "private", "account"),
                payload,
                { merge: true }
              )
              .catch(() => {
                if (active) setConnected(false);
              });
          }
        });
      })
      .catch(() => {
        if (active) {
          setConnected(false);
          if (needsSessionRef.current) {
            setAuthError("ไม่สามารถโหลด Firebase Authentication ได้");
          }
          setAuthReady(true);
        }
      });

    return () => {
      active = false;
      sdkRef.current = null;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk) {
      setAuthError("ระบบล็อกอินยังไม่พร้อม กรุณาลองใหม่");
      return;
    }
    setBusy(true);
    setAuthError("");
    actionInFlightRef.current = true;
    try {
      sdk.fb.ensureAppCheck();
      // Important: signInWithPopup is invoked before the first await.
      const credential = await sdk.authMod.signInWithPopup(sdk.fb.auth, sdk.fb.googleProvider);
      if (!credential.user.emailVerified) {
        setAuthError("บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล กรุณายืนยันอีเมลก่อนเข้าสู่ Workspace");
        return;
      }
      await syncFirebaseSession(credential.user, true);
      const session = await refreshBrowserSession({ reason: "login-check" });
      if (!session.signedIn) {
        throw new FirebaseSessionSyncError("เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง", 401);
      }
      setUser(credential.user);
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  const signInWithGitHub = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk) {
      setAuthError("ระบบล็อกอินยังไม่พร้อม กรุณาลองใหม่");
      return;
    }
    setBusy(true);
    setAuthError("");
    actionInFlightRef.current = true;
    try {
      sdk.fb.ensureAppCheck();
      // Important: signInWithPopup is invoked before the first await.
      const credential = await sdk.authMod.signInWithPopup(sdk.fb.auth, sdk.fb.githubProvider);
      if (!credential.user.emailVerified) {
        setAuthError("GitHub ไม่ได้ส่งอีเมลที่ยืนยันแล้ว กรุณายืนยันอีเมลกับผู้ให้บริการก่อนใช้ Workspace");
        return;
      }
      await syncFirebaseSession(credential.user, true);
      const session = await refreshBrowserSession({ reason: "login-check" });
      if (!session.signedIn) {
        throw new FirebaseSessionSyncError("เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง", 401);
      }
      setUser(credential.user);
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  const linkGitHubSignIn = useCallback(async () => {
    const sdk = sdkRef.current;
    const current = sdk?.fb.auth.currentUser;
    if (!sdk || !current || !current.emailVerified) {
      setAuthError("กรุณาเข้าสู่ระบบและยืนยันอีเมลก่อนเชื่อม GitHub");
      return false;
    }
    if (current.providerData.some(provider => provider.providerId === "github.com")) return true;
    setBusy(true);
    setAuthError("");
    actionInFlightRef.current = true;
    try {
      const result = await sdk.authMod.linkWithPopup(current, sdk.fb.githubProvider);
      if (result.user.uid !== current.uid) throw new Error("Account identity changed unexpectedly.");
      await syncFirebaseSession(result.user, true);
      await refreshBrowserSession({ reason: "login-check" });
      setUser(result.user);
      return true;
    } catch (error) {
      setAuthError(safeAuthError(error));
      return false;
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  const linkGoogleSignIn = useCallback(async () => {
    const sdk = sdkRef.current;
    const current = sdk?.fb.auth.currentUser;
    if (!sdk || !current || !current.emailVerified) {
      setAuthError("กรุณาเข้าสู่ระบบและยืนยันอีเมลก่อนเชื่อม Google");
      return false;
    }
    if (current.providerData.some(provider => provider.providerId === "google.com")) return true;
    setBusy(true);
    setAuthError("");
    actionInFlightRef.current = true;
    try {
      const result = await sdk.authMod.linkWithPopup(current, sdk.fb.googleProvider);
      if (result.user.uid !== current.uid) throw new Error("Account identity changed unexpectedly.");
      await syncFirebaseSession(result.user, true);
      await refreshBrowserSession({ reason: "login-check" });
      setUser(result.user);
      return true;
    } catch (error) {
      setAuthError(safeAuthError(error));
      return false;
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  const signOutFirebase = useCallback(async () => {
    setBusy(true);
    setAuthError("");
    actionInFlightRef.current = true;
    try {
      const sdk = sdkRef.current;
      if (!sdk) throw new Error("Firebase is unavailable.");
      await clearFirebaseSession();
      await sdk.authMod.signOut(sdk.fb.auth);
      await refreshBrowserSession({ reason: "login-check" });
      setUser(null);
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        connected,
        busy,
        authError,
        clearAuthError,
        signInWithGoogle,
        signInWithGitHub,
        linkGitHubSignIn,
        linkGoogleSignIn,
        signOutFirebase,
      }}
    >
      <FirebaseErrorBoundary>
        {needsSession && !authReady ? (
          <main className="auth-page">
            <p role="status">กำลังเชื่อมบัญชี Workspace…</p>
          </main>
        ) : (
          children
        )}
      </FirebaseErrorBoundary>
    </FirebaseContext.Provider>
  );
}
