import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/dynamic", () => ({
  default: () => function DynamicStub() {
    return null;
  },
}));

// Exercise a stale background error, not just the context's empty default.
vi.mock("../components/FirebaseProvider", () => ({
  useFirebase: () => ({
    user: null,
    authReady: true,
    busy: false,
    authError: "เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง",
    signInWithGoogle: vi.fn(),
    signInWithGitHub: vi.fn(),
  }),
}));

import AuthLogin from "../components/AuthLogin";
import { isServerGeminiConfigured } from "./byok-policy";
import {
  clearSessionCookie,
  FIREBASE_SESSION_COOKIE,
  sessionCookie,
} from "./firebase-session";

beforeAll(() => {
  Object.assign(globalThis, { React });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Auth login and signup initial clean-session regression", () => {
  it("renders /login without any error banner before the user clicks any button", () => {
    const html = renderToStaticMarkup(React.createElement(AuthLogin));
    expect(html).toContain("Welcome back");
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Continue with GitHub");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("เชื่อมบัญชีกับ Workspace ไม่สำเร็จ");
    expect(html).not.toContain("auth-alert");
  });

  it("renders /signup without any error banner before the user submits the form", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthLogin, { initialMode: "sign-up" })
    );
    expect(html).toContain("Create your account");
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Continue with GitHub");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("เชื่อมบัญชีกับ Workspace ไม่สำเร็จ");
    expect(html).not.toContain("auth-alert");
  });
});

describe("Firebase session cookie and server Gemini configuration", () => {
  it("issues HttpOnly __Host-aisdk-session cookies and supports iframe SameSite=None when embedded", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-test-secret-0123456789abcdef");
    const claims = {
      sub: "user-123",
      firebaseUid: "fb-123",
      email: "ada@example.com",
      name: "Ada",
      image: null,
    };

    const topLevelCookie = await sessionCookie(
      claims,
      new Request("https://platform.ai-sdk.pro/api/auth/firebase-session")
    );
    expect(topLevelCookie).toContain(`${FIREBASE_SESSION_COOKIE}=`);
    expect(topLevelCookie).toContain("HttpOnly; Secure; SameSite=Lax");

    const iframeCookie = await sessionCookie(
      claims,
      new Request("https://platform.ai-sdk.pro/api/auth/firebase-session", {
        headers: { "sec-fetch-dest": "iframe" },
      })
    );
    expect(iframeCookie).toContain("SameSite=None; Partitioned");
    expect(clearSessionCookie()).toContain(`${FIREBASE_SESSION_COOKIE}=;`);
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  it("enables server Gemini mode when GEMINI_API_KEY is configured and BYOK_ONLY is not true", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("BYOK_ONLY", "");
    expect(isServerGeminiConfigured()).toBe(false);

    vi.stubEnv("GEMINI_API_KEY", "synthetic-gemini-api-key");
    expect(isServerGeminiConfigured()).toBe(true);

    vi.stubEnv("BYOK_ONLY", "true");
    expect(isServerGeminiConfigured()).toBe(false);
  });
});
