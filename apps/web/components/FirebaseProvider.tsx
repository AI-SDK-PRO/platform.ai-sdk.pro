"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { syncFirebaseSession, clearFirebaseSession } from "../lib/firebase-session-client";
import { refreshBrowserSession } from "../lib/browser-session";
import FirebaseErrorBoundary from "./FirebaseErrorBoundary";

export interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  connected: boolean | null;
  busy: boolean;
  authError: string;
  signInWithGoogle: () => Promise<void>;
  signOutFirebase: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  connected: null,
  busy: false,
  authError: "",
  signInWithGoogle: async () => undefined,
  signOutFirebase: async () => undefined,
});

export function useFirebase() {
  return useContext(FirebaseContext);
}

export default function FirebaseProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const needsSession = pathname.startsWith("/workspace") || pathname === "/deploy";
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
        void fb.testConnection().then(value => {
          if (active) setConnected(value);
        });

        unsubscribe = authMod.onAuthStateChanged(fb.auth, async nextUser => {
          if (!active) return;
          setAuthReady(false);
          setAuthError("");
          try {
            if (nextUser?.emailVerified) await syncFirebaseSession(nextUser);
            else await clearFirebaseSession();
            await refreshBrowserSession({ reason: "login-check" });
            if (active) setUser(nextUser);
          } catch {
            if (active) {
              setUser(nextUser);
              setAuthError("เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง");
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
          setAuthReady(true);
        }
      });

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setAuthError("");
    try {
      const [authMod, fb] = await Promise.all([
        import("firebase/auth"),
        import("../lib/firebase"),
      ]);
      const credential = await authMod.signInWithPopup(fb.auth, fb.googleProvider);
      await syncFirebaseSession(credential.user);
      await refreshBrowserSession({ reason: "login-check" });
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Google Sign-In failed."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const signOutFirebase = useCallback(async () => {
    setBusy(true);
    setAuthError("");
    try {
      const [authMod, fb] = await Promise.all([
        import("firebase/auth"),
        import("../lib/firebase"),
      ]);
      await clearFirebaseSession();
      await authMod.signOut(fb.auth);
      await refreshBrowserSession({ reason: "login-check" });
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Firebase sign-out failed."
      );
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
