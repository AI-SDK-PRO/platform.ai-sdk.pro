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
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  auth,
  buildAccountPayload,
  db,
  googleProvider,
  testConnection,
} from "../lib/firebase";
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
    void testConnection().then(setConnected);

    const unsubscribe = onAuthStateChanged(auth, async nextUser => {
      setAuthReady(false);
      setAuthError("");
      try {
        if (nextUser?.emailVerified) await syncFirebaseSession(nextUser);
        else await clearFirebaseSession();
        await refreshBrowserSession({ reason: "login-check" });
        setUser(nextUser);
      } catch {
        setUser(nextUser);
        setAuthError("เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง");
      } finally { setAuthReady(true); }

      if (nextUser?.email && nextUser.emailVerified) {
        const accountPath = `users/${nextUser.uid}/private/account`;
        const payload = buildAccountPayload({
          uid: nextUser.uid,
          displayName: nextUser.displayName,
          email: nextUser.email,
          updatedAt: serverTimestamp(),
        });
        void setDoc(doc(db, "users", nextUser.uid, "private", "account"), payload, {
          merge: true,
        }).catch(error => {
          setConnected(false);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setAuthError("");
    try {
      const credential = await signInWithPopup(auth, googleProvider);
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
      await clearFirebaseSession();
      await signOut(auth);
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
      <FirebaseErrorBoundary>{needsSession && !authReady
        ? <main className="auth-page"><p role="status">กำลังเชื่อมบัญชี Workspace…</p></main>
        : children}</FirebaseErrorBoundary>
    </FirebaseContext.Provider>
  );
}
