"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SkeletonBlock, StatusBadge } from "@aisdkpro/ui";
import LLMChat from "./llm";
import SiteHeader from "./SiteHeader";

const KeylessChat = dynamic(() => import("./KeylessChat"), {
  ssr: false,
  loading: () => (
    <div className="edge-chat-empty edge-chat-loading" role="status">
      <SkeletonBlock height={28} width="240px" />
      <SkeletonBlock height={84} />
    </div>
  ),
});
import {
  getBrowserSessionSnapshot,
  getServerBrowserSessionSnapshot,
  refreshBrowserSession,
  subscribeToBrowserSession,
} from "../lib/browser-session";

type ChatMode = "gemini" | "byok" | "keyless";

export default function ChatDualMode() {
  const session = useSyncExternalStore(
    subscribeToBrowserSession,
    getBrowserSessionSnapshot,
    getServerBrowserSessionSnapshot
  );
  const [mode, setMode] = useState<ChatMode>("byok");
  const [serverGeminiConfigured, setServerGeminiConfigured] = useState(false);
  const [serverModel, setServerModel] = useState("gemini-4-hydrogen");
  const choseMode = useRef(false);
  const edgeConfigured = Boolean(process.env.NEXT_PUBLIC_CF_AGENT_URL);

  useEffect(() => {
    void refreshBrowserSession({ reason: "initial" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/config", { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then((data: { serverGeminiConfigured?: boolean; model?: string } | null) => {
        if (!active || !data) return;
        const geminiReady = data.serverGeminiConfigured === true;
        setServerGeminiConfigured(geminiReady);
        if (typeof data.model === "string" && data.model.trim()) {
          setServerModel(data.model.trim());
        }
        if (!choseMode.current && geminiReady) {
          setMode("gemini");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!choseMode.current && !serverGeminiConfigured && edgeConfigured && session.signedIn) {
      setMode("keyless");
    } else if (!session.signedIn && mode === "keyless") {
      setMode(serverGeminiConfigured ? "gemini" : "byok");
    }
  }, [edgeConfigured, serverGeminiConfigured, session.signedIn, mode]);

  function choose(next: ChatMode) {
    choseMode.current = true;
    setMode(next);
  }

  return (
    <>
      <SiteHeader active="chat" />
      <nav className="chat-mode-bar" aria-label="Chat model and credential mode">
        <div className="chat-mode-brand">
          <span>AI Playground</span>
          <StatusBadge
            status={mode === "keyless" ? "edge" : mode === "gemini" ? "ready" : "byok"}
          >
            {mode === "keyless"
              ? "Cloudflare Edge"
              : mode === "gemini"
                ? "Gemini Server"
                : "BYOK"}
          </StatusBadge>
        </div>
        <div className="chat-mode-options">
          {serverGeminiConfigured && (
            <button
              type="button"
              className={mode === "gemini" ? "active" : ""}
              aria-pressed={mode === "gemini"}
              onClick={() => choose("gemini")}
            >
              Gemini Server ({serverModel})
            </button>
          )}
          <button
            type="button"
            className={mode === "byok" ? "active" : ""}
            aria-pressed={mode === "byok"}
            onClick={() => choose("byok")}
          >
            Bring Your Own Key
          </button>
          <button
            type="button"
            className={mode === "keyless" ? "active" : ""}
            aria-pressed={mode === "keyless"}
            disabled={!edgeConfigured || !session.signedIn}
            onClick={() => choose("keyless")}
          >
            Cloudflare GLM-4.7-Flash
          </button>
        </div>
        <span className="chat-mode-state">
          {mode === "gemini"
            ? `Server default · ${serverModel}`
            : edgeConfigured
              ? session.signedIn
                ? "Signed in · Edge available"
                : <Link href="/login">Sign in for Keyless</Link>
              : "BYOK / Server mode"}
        </span>
      </nav>
      {mode === "keyless" && edgeConfigured && session.signedIn ? (
        <KeylessChat onSwitchToByok={() => choose("byok")} />
      ) : (
        <LLMChat
          showHeader={false}
          preferredMode={mode === "gemini" ? "gemini" : "byok"}
        />
      )}
    </>
  );
}
