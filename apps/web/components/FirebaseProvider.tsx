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
import { syncFirebaseSession, clearFirebaseSession } from "../lib/firebase-session-client";
import { refreshBrowserSession } from "../lib/browser-session";
import FirebaseErrorBoundary from "./FirebaseErrorBoundary";

type FirebaseSDK = {
  authMod: typeof import("firebase/auth");
  fb: typeof import("../lib/firebase");
};

function safeAuthError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  switch (code) {
    case "auth/popup-blocked": return "เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต Pop-ups สำหรับเว็บไซต์นี้ แล้วลองใหม่";
    case "auth/popup-closed-by-user": return "ปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จ";
    case "auth/account-exists-with-different-credential":
      return "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิมก่อน แล้วเพิ่ม GitHub ที่ Account Settings เพื่อใช้บัญชีเดียวกัน";
    case "auth/credential-already-in-use": return "บัญชี GitHub นี้เชื่อมกับผู้ใช้อื่นอยู่แล้ว ระบบจะไม่รวมบัญชีให้อัตโนมัติ";
    case "auth/provider-already-linked": return "ช่องทางนี้เชื่อมกับบัญชีของคุณแล้ว";
    case "auth/operation-not-allowed": return "ช่องทางนี้ยังไม่เปิดใช้งานใน Firebase Authentication กรุณาตรวจ Provider Settings";
    case "auth/unauthorized-domain": return "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication";
    case "auth/network-request-failed": return "เชื่อมต่อระบบล็อกอินไม่ได้ กรุณาตรวจเครือข่ายแล้วลองใหม่";
    case "auth/requires-recent-login": return "กรุณาออกจากระบบแล้วเข้าสู่ระบบอีกครั้ง ก่อนเชื่อมช่องทางใหม่";
    case "auth/operation-not-supported-in-this-environment":
    case "auth/web-storage-unsupported":
      return "เบราว์เซอร์นี้ไม่รองรับการเข้าสู่ระบบแบบ Popup กรุณาเปิดเว็บใน Chrome หรือ Safari โดยตรง";
    case "auth/internal-error":
      return "ระบบ Firebase OAuth ตอบกลับผิดพลาด กรุณาตรวจ Google/GitHub Provider และ OAuth callback ใน Firebase Console";
    case "auth/invalid-api-key":
    case "auth/app-not-authorized":
      return "การตั้งค่า Firebase สำหรับโดเมนนี้ไม่ถูกต้อง กรุณาตรวจ Firebase Project และ API key";
    case "auth/cancelled-popup-request":
      return "มีการเปิดหน้าต่างเข้าสู่ระบบใหม่แล้ว กรุณาดำเนินการในหน้าต่างล่าสุด";
    default: return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่หรือตรวจการตั้งค่า Firebase";
  }
}

export interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  connected: boolean | null;
  busy: boolean;
  authError: string;
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
  const sdkRef = useRef<FirebaseSDK | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");

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
        // Load the SDK before enabling buttons. Starting OAuth after awaiting
        // a dynamic import inside the click handler can trigger popup blocking.
        sdkRef.current = { authMod, fb };
        void fb.testConnection().then(value => {
          if (active) setConnected(value);
        });

        unsubscribe = authMod.onAuthStateChanged(fb.auth, async nextUser => {
          if (!active) return;
          setAuthReady(false);
          setAuthError("");
          try {
            if (nextUser?.emailVerified) {
              // Only establish a platform session after a verified Firebase login.
              await syncFirebaseSession(nextUser);
              await refreshBrowserSession({ reason: "login-check" });
            } else {
              // The login/signup page must work for visitors without an account.
              // Do not send a DELETE for every anonymous visit; that request can
              // fail (origin, network, stale cookie) and previously surfaced as
              // a misleading login error before any user interaction.
              try {
                const session = await refreshBrowserSession({ reason: "login-check" });
                if (session.signedIn) {
                  // A server session must not outlive its Firebase identity.
                  await clearFirebaseSession();
                  await refreshBrowserSession({ reason: "login-check" });
                }
              } catch (error) {
                // A public login page must remain usable while session cleanup
                // is unavailable. Authentication calls still report real errors.
                console.warn("Could not reconcile an inactive login session", error);
              }
            }
            if (active) setUser(nextUser);
          } catch (error) {
            console.error("Firebase session restoration failed", error);
            if (active) {
              setUser(nextUser);
              // Show a restoration error only if there is an actual verified
              // Firebase user whose workspace session could not be created.
              if (nextUser?.emailVerified) {
                setAuthError("ไม่สามารถกู้คืนเซสชัน Workspace ได้ กรุณาลองเข้าสู่ระบบอีกครั้ง");
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
          setAuthError("ไม่สามารถโหลด Firebase Authentication ได้");
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
    if (!sdk) { setAuthError("ระบบล็อกอินยังไม่พร้อม กรุณาลองใหม่"); return; }
    setBusy(true);
    setAuthError("");
    try {
      // Important: signInWithPopup is invoked before the first await.
      const credential = await sdk.authMod.signInWithPopup(sdk.fb.auth, sdk.fb.googleProvider);
      if (!credential.user.emailVerified) {
        setAuthError("กรุณายืนยันอีเมลก่อนเข้าสู่ Workspace");
        return;
      }
      await syncFirebaseSession(credential.user);
      await refreshBrowserSession({ reason: "login-check" });
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const signInWithGitHub = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk) { setAuthError("ระบบล็อกอินยังไม่พร้อม กรุณาลองใหม่"); return; }
    setBusy(true);
    setAuthError("");
    try {
      const credential = await sdk.authMod.signInWithPopup(sdk.fb.auth, new sdk.authMod.GithubAuthProvider());
      if (!credential.user.emailVerified) {
        setAuthError("GitHub ไม่ได้ส่งอีเมลที่ยืนยันแล้ว กรุณายืนยันอีเมลกับผู้ให้บริการก่อนใช้ Workspace");
        return;
      }
      await syncFirebaseSession(credential.user);
      await refreshBrowserSession({ reason: "login-check" });
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
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
    try {
      const result = await sdk.authMod.linkWithPopup(current, new sdk.authMod.GithubAuthProvider());
      if (result.user.uid !== current.uid) throw new Error("Account identity changed unexpectedly.");
      await syncFirebaseSession(result.user);
      await refreshBrowserSession({ reason: "login-check" });
      setUser(result.user);
      return true;
    } catch (error) {
      setAuthError(safeAuthError(error));
      return false;
    } finally {
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
    try {
      const result = await sdk.authMod.linkWithPopup(current, sdk.fb.googleProvider);
      if (result.user.uid !== current.uid) throw new Error("Account identity changed unexpectedly.");
      await syncFirebaseSession(result.user);
      await refreshBrowserSession({ reason: "login-check" });
      setUser(result.user);
      return true;
    } catch (error) {
      setAuthError(safeAuthError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const signOutFirebase = useCallback(async () => {
    setBusy(true);
    setAuthError("");
    try {
      const sdk = sdkRef.current;
      if (!sdk) throw new Error("Firebase is unavailable.");
      await clearFirebaseSession();
      await sdk.authMod.signOut(sdk.fb.auth);
      await refreshBrowserSession({ reason: "login-check" });
    } catch (error) {
      setAuthError(safeAuthError(error));
    } finally {
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
