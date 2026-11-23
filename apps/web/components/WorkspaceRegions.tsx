"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { authClient } from "../lib/auth-client";
import type { PlatformSession } from "../lib/platform-types";
import DeploymentRegionsMap from "./DeploymentRegionsMap";
import WorkspaceChrome from "./WorkspaceChrome";

export default function WorkspaceRegions({ apiKey }: { apiKey: string }) {
  const [session, setSession] = useState<PlatformSession>({ user: null });
  const [logoutPending, setLogoutPending] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const current = (await response.json()) as PlatformSession;
      setSession(current);
    } catch {
      /* keep guest chrome */
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function logout() {
    setLogoutPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed.");
      window.location.assign("/login");
    } catch {
      setLogoutPending(false);
    }
  }

  return (
    <WorkspaceChrome
      user={session.user}
      onLogout={() => {
        void logout();
      }}
      logoutPending={logoutPending}
    >
      <section className="space-y-6" aria-label="Deployment regions map">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="workspace-section-kicker">WORKSPACE / REGIONS</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--fg)]">
              Infrastructure & Deployment Regions
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              Explore the active edge gateways, database regions, and self-hosted
              VPS nodes powering ai-sdk.pro deployments.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)]">
            <Globe size={14} className="text-[var(--accent)]" />
            4 active infrastructure nodes
          </span>
        </div>

        <DeploymentRegionsMap apiKey={apiKey} />
      </section>
    </WorkspaceChrome>
  );
}
