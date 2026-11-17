"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { EmptyStateBox, GeistCard, SkeletonBlock, StatusBadge } from "@aisdkpro/ui";
import WorkspaceChrome from "../../../components/WorkspaceChrome";
import { authClient } from "../../../lib/auth-client";
import type { PlatformSession } from "../../../lib/platform-types";

const endpoint = "/api/platform/tokens";

type TokenRecord = {
  id: string;
  label: string;
  prefix: string;
  scope: string;
  expires_at: string;
};

async function readTokens(signal: AbortSignal): Promise<TokenRecord[]> {
  const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Sign in to manage API tokens." : "Unable to load API tokens.");
  }
  const payload = (await response.json()) as { tokens: TokenRecord[] };
  return payload.tokens;
}

export default function PlatformTokensPage() {
  const [session, setSession] = useState<PlatformSession>({ user: null });
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState("");
  const [copiedIssued, setCopiedIssued] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [pending, setPending] = useState(true);
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/platform/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(res => (res.ok ? (res.json() as Promise<PlatformSession>) : { user: null }))
      .then(value => {
        if (!controller.signal.aborted) setSession(value);
      })
      .catch(() => undefined);

    void readTokens(controller.signal)
      .then(items => {
        setTokens(items);
        setSignedOut(false);
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : "Unable to load API tokens.";
        if (message.includes("Sign in")) {
          setSignedOut(true);
        } else {
          setError(message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || pending) return;
    setPending(true);
    setError("");
    setCopiedIssued(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const result = (await response.json()) as { token?: string; record?: TokenRecord; error?: string };
      if (!response.ok || !result.token || !result.record) {
        throw new Error(result.error ?? "Unable to create token.");
      }
      setIssued(result.token);
      setTokens(current => [result.record as TokenRecord, ...current].slice(0, 100));
      setLabel("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create token.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Unable to revoke token.");
      setTokens(current => current.filter(token => token.id !== id));
      setConfirmRevokeId(null);
      setIssued("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to revoke token.");
    } finally {
      setPending(false);
    }
  }

  async function copyIssued() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopiedIssued(true);
      setTimeout(() => setCopiedIssued(false), 1800);
    } catch {
      setCopiedIssued(false);
    }
  }

  async function logout() {
    setLogoutPending(true);
    try {
      await authClient.signOut();
      window.location.assign("/login");
    } catch {
      setLogoutPending(false);
      setError("Sign out failed.");
    }
  }

  return (
    <WorkspaceChrome user={session.user} onLogout={() => { void logout(); }} logoutPending={logoutPending}>
      <section className="workspace-tokens-section" aria-label="Platform API tokens">
        <div className="workspace-tokens-header">
          <div>
            <span className="workspace-account-kicker">WORKSPACE / TOKENS</span>
            <h1>Platform API tokens</h1>
            <p>Read imported repository snapshots from automated workflows. Tokens expire automatically after 90 days.</p>
          </div>
          <StatusBadge status={signedOut ? "error" : "ready"}>
            {signedOut ? "Sign-in required" : `${tokens.length} active`}
          </StatusBadge>
        </div>

        {pending && tokens.length === 0 ? (
          <GeistCard className="workspace-tokens-card">
            <SkeletonBlock height={28} width="220px" />
            <SkeletonBlock height={44} />
            <SkeletonBlock height={64} />
          </GeistCard>
        ) : signedOut ? (
          <EmptyStateBox
            title="Sign in to manage API tokens"
            description="Platform API tokens are isolated per user account and require an active session."
            icon={<KeyRound size={22} />}
            action={
              <Link href="/login" className="workspace-button workspace-button-primary">
                Sign in
              </Link>
            }
          />
        ) : (
          <>
            <GeistCard className="workspace-tokens-card">
              <form className="workspace-tokens-form" onSubmit={event => { void create(event); }}>
                <label className="workspace-tokens-field">
                  Token name
                  <input
                    value={label}
                    onChange={event => setLabel(event.target.value)}
                    placeholder="e.g., ci-snapshot-reader"
                    maxLength={64}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="workspace-button workspace-button-primary"
                  disabled={pending || !label.trim()}
                >
                  <Plus size={14} /> Create token
                </button>
              </form>
              {error && <p role="alert" className="workspace-account-error">{error}</p>}
            </GeistCard>

            {issued && (
              <GeistCard className="workspace-tokens-issued" role="status">
                <strong>Copy your token now</strong>
                <p>Its full value is displayed only once and is never retrievable later.</p>
                <div className="workspace-tokens-issued-code">
                  <code className="select-all">{issued}</code>
                  <button
                    type="button"
                    className="workspace-button workspace-button-secondary"
                    onClick={() => { void copyIssued(); }}
                  >
                    {copiedIssued ? <Check size={14} /> : <Copy size={14} />}
                    {copiedIssued ? "Copied" : "Copy"}
                  </button>
                </div>
                <div>
                  <button
                    type="button"
                    className="workspace-button workspace-button-secondary"
                    onClick={() => setIssued("")}
                  >
                    Dismiss
                  </button>
                </div>
              </GeistCard>
            )}

            {tokens.length === 0 ? (
              <EmptyStateBox
                title="No API tokens issued"
                description="Create a scoped token above to authenticate read-only repository snapshot requests."
                icon={<KeyRound size={20} />}
              />
            ) : (
              <div className="workspace-tokens-list">
                {tokens.map(token => (
                  <GeistCard className="workspace-tokens-row" key={token.id}>
                    <div className="workspace-tokens-meta">
                      <strong>{token.label}</strong>
                      <span>
                        {token.prefix}… · scope: {token.scope} · expires{" "}
                        {new Date(token.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="workspace-tokens-actions">
                      {confirmRevokeId === token.id ? (
                        <>
                          <button
                            type="button"
                            className="workspace-button workspace-button-primary"
                            disabled={pending}
                            onClick={() => { void revoke(token.id); }}
                          >
                            Confirm revoke
                          </button>
                          <button
                            type="button"
                            className="workspace-button workspace-button-secondary"
                            disabled={pending}
                            onClick={() => setConfirmRevokeId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="workspace-button workspace-button-secondary"
                          disabled={pending}
                          onClick={() => setConfirmRevokeId(token.id)}
                        >
                          <Trash2 size={14} /> Revoke
                        </button>
                      )}
                    </div>
                  </GeistCard>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </WorkspaceChrome>
  );
}
