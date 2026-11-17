'use client';
import type { User } from 'firebase/auth';
let inFlight: { uid: string; promise: Promise<void> } | null = null;
export function syncFirebaseSession(user: User): Promise<void> {
  if (inFlight?.uid === user.uid) return inFlight.promise;
  const promise = (async () => {
    const response = await fetch('/api/auth/firebase-session', { method: 'POST',
      credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: await user.getIdToken() }) });
    if (!response.ok) throw new Error('เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง');
  })().finally(() => { if (inFlight?.promise === promise) inFlight = null; });
  inFlight = { uid: user.uid, promise };
  return promise;
}
export async function clearFirebaseSession() {
  const response = await fetch('/api/auth/firebase-session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Sign out could not be completed.');
}
