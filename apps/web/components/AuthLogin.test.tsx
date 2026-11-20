import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React, { type ReactNode } from "react";
import AuthLogin from "./AuthLogin";

// A visitor may encounter a background Firebase/session error. It must not
// become an alert until a deliberate OAuth sign-in action is initiated.
vi.mock("./FirebaseProvider", () => ({
  useFirebase: () => ({
    user: null,
    authReady: true,
    busy: false,
    authError: "เชื่อมบัญชีกับ Workspace ไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง",
    signInWithGoogle: vi.fn(),
    signInWithGitHub: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="email-form" />,
}));
vi.mock("../lib/browser-session", () => ({
  refreshBrowserSession: vi.fn(),
}));

describe("AuthLogin initial render", () => {
  it.each(["sign-in", "sign-up"] as const)(
    "%s shows no Workspace failure before a user clicks sign in",
    initialMode => {
      const markup = renderToStaticMarkup(<AuthLogin initialMode={initialMode} />);
      expect(markup).not.toContain("เชื่อมบัญชีกับ Workspace ไม่สำเร็จ");
      expect(markup).not.toContain('role="alert"');
      expect(markup).toContain("Continue with Google");
      expect(markup).toContain("Continue with GitHub");
      expect(markup).toContain('data-testid="email-form"');
    }
  );
});
