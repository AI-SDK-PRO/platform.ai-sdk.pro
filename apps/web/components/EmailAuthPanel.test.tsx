import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth-client", () => ({ authClient: {} }));
import EmailAuthPanel from "./EmailAuthPanel";

beforeAll(() => {
  Object.assign(globalThis, { React });
});

describe("email password form compatibility", () => {
  it("does not apply a new-account minimum to existing users signing in", () => {
    const html = renderToStaticMarkup(
      <EmailAuthPanel enabled initialMode="sign-in" />
    );
    const passwordInput = html.match(/<input id="auth-password"[^>]*>/)?.[0];
    expect(passwordInput).toContain('minLength="1"');
    expect(passwordInput).toContain('autoComplete="current-password"');
  });

  it("preserves the stronger password policy and confirmation for registration", () => {
    const html = renderToStaticMarkup(
      <EmailAuthPanel enabled initialMode="sign-up" />
    );
    const passwordInput = html.match(/<input id="auth-password"[^>]*>/)?.[0];
    expect(passwordInput).toContain('minLength="12"');
    expect(passwordInput).toContain('autoComplete="new-password"');
    expect(html).toContain('id="auth-confirm-password"');
    expect(html).not.toContain('role="alert"');
  });
});
