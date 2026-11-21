import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicStub() {
      return null;
    },
}));

vi.mock("./auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
  },
}));

import AuthLogin from "../components/AuthLogin";
import { isServerGeminiConfigured } from "./byok-policy";
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

describe("server Gemini configuration", () => {
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
