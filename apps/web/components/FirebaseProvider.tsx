"use client";

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
  handleFirestoreError,
  OperationType,
  testConnection,
} from "../lib/firebase";
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    void testConnection().then(setConnected);

    const unsubscribe = onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      setAuthReady(true);

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
          handleFirestoreError(error, OperationType.WRITE, accountPath);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setAuthError("");
    try {
      await signInWithPopup(auth, googleProvider);
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
      await signOut(auth);
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
      <FirebaseErrorBoundary>{children}</FirebaseErrorBoundary>
    </FirebaseContext.Provider>
  );
}
