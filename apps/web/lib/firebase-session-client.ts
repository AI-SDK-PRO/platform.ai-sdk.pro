'use client';
import type { User } from 'firebase/auth';
let inFlight: { uid: string; promise: Promise<void> } | null = null;

export class FirebaseSessionSyncError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'FirebaseSessionSyncError';
    this.status = status;
  }
}

export function syncFirebaseSession(user: User, forceRefresh = false): Promise<void> {
  if (!forceRefresh && inFlight?.uid === user.uid) return inFlight.promise;
  const promise = (async () => {
    const idToken = await user.getIdToken(forceRefresh);
    const response = await fetch('/api/auth/firebase-session', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      let message = 'เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง';
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string' && body.error.trim().length > 0 && body.error.length <= 200) {
          message = body.error.trim();
        }
      } catch {
        // Keep localized fallback message.
      }
      throw new FirebaseSessionSyncError(message, response.status);
    }
  })().finally(() => { if (inFlight?.promise === promise) inFlight = null; });
  inFlight = { uid: user.uid, promise };
  return promise;
}
export async function clearFirebaseSession() {
  const response = await fetch('/api/auth/firebase-session', {
    method: 'DELETE',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Sign out could not be completed.');
}
