"use client";
import { confirmPasswordReset, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { auth } from './firebase';
import { clearFirebaseSession, syncFirebaseSession } from './firebase-session-client';

type Result = { error: { status: number; message: string } | null };
async function result(action: () => Promise<void>): Promise<Result> {
  try { await action(); return { error: null }; }
  catch { return { error: { status: 400, message: 'Authentication could not be completed.' } }; }
}
export const authClient = {
  signOut: async () => {
    // Clear the HttpOnly workspace session before changing browser auth state.
    await clearFirebaseSession();
    await signOut(auth);
    return { error: null };
  },
  linkSocial: async (_input: { provider: string; callbackURL?: string }) => {
    window.location.assign('/api/connections/github');
    return { error: null };
  },
  signIn: {
    email: async (input: { email: string; password: string; callbackURL?: string; rememberMe?: boolean }): Promise<Result> => {
      try {
        const { user } = await signInWithEmailAndPassword(auth, input.email, input.password);
        if (!user.emailVerified) return { error: { status: 403, message: 'Verify your email first.' } };
        await syncFirebaseSession(user);
        return { error: null };
      } catch { return { error: { status: 400, message: 'Sign-in failed.' } }; }
    },
  },
  signUp: {
    email: (input: { email: string; password: string; name: string; callbackURL?: string }) => result(async () => {
      const { user } = await createUserWithEmailAndPassword(auth, input.email, input.password);
      await updateProfile(user, { displayName: input.name });
      await sendEmailVerification(user, { url: window.location.origin + '/login?verified=1' });
    }),
  },
  requestPasswordReset: (input: { email: string; redirectTo?: string }) => result(async () => {
    await sendPasswordResetEmail(auth, input.email, { url: window.location.origin + '/login' });
  }),
  sendVerificationEmail: (_input: { email: string; callbackURL?: string }) => result(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser, { url: window.location.origin + '/login?verified=1' });
  }),
  resetPassword: (input: { newPassword: string; token: string }) => result(async () => {
    await confirmPasswordReset(auth, input.token, input.newPassword);
  }),
};
