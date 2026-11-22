"use client";

import { useEffect, useState } from "react";

type Session = { user: { emailVerified: boolean } } | null;
type Email = { email: string };
type Redirect = { callbackURL?: string; redirectTo?: string };
type Social = Redirect & { provider: "google" | "github" };
type Result = { error: { status: number; message: string; code?: string } | null };

async function mutate(path: string, input: object = {}): Promise<Result> {
  const response = await fetch("/api/auth/" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    return { error: { status: response.status, message: typeof data.error === "string" ? data.error : "Authentication failed.", code: data.code } };
  if (typeof data.url === "string") window.location.assign(data.url);
  return { error: null };
}

export const authClient = {
  useSession() {
    const [data, setData] = useState<Session>(null);
    const [isPending, setPending] = useState(true);
    useEffect(() => {
      const controller = new AbortController();
      void fetch("/api/auth/get-session", { cache: "no-store", signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(value => { if (!controller.signal.aborted) setData(value); })
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setPending(false); });
      return () => controller.abort();
    }, []);
    return { data, isPending };
  },
  signIn: {
    social: (input: Social) => mutate("sign-in/social", input),
    email: (input: Email & { password: string }) => mutate("sign-in/email", input),
  },
  signUp: {
    email: (input: Email & Redirect & { password: string; name: string }) =>
      mutate("sign-up/email", input),
  },
  signOut: () => mutate("sign-out"),
  sendVerificationEmail: (input: Email & Redirect) => mutate("send-verification-email", input),
  requestPasswordReset: (input: Email & Redirect) => mutate("request-password-reset", input),
  resetPassword: (input: { token: string; newPassword: string }) => mutate("reset-password", input),
  linkSocial: (input: Social) => mutate("link-social", input),
};
