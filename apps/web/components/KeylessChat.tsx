"use client";

import Link from "next/link";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Check, Copy, MessageSquarePlus, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Streamdown } from "streamdown";
import { StatusBadge } from "@aisdkpro/ui";

type TokenResponse = { token: string; userId: string; threadId: string; expiresAt: string };
type Quota = { used: number; remaining: number; remainingBudgetMicros: number };

const THREAD_STORAGE = "aisdkpro:edge-thread-id";
const THREAD_LIST_STORAGE = "aisdkpro:edge-threads";
const INPUT_LIMIT = 4000;

function isTokenResponse(value: unknown): value is TokenResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<TokenResponse>;
  return typeof candidate.token === "string" &&
    typeof candidate.userId === "string" && candidate.userId.length > 0 &&
    typeof candidate.threadId === "string" &&
    typeof candidate.expiresAt === "string";
}

function newThreadId(): string {
  return crypto.randomUUID();
}

function readThreadList(activeId: string): string[] {
  try {
    const raw = window.localStorage.getItem(THREAD_LIST_STORAGE);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const valid = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && /^[a-z0-9_-]{1,64}$/i.test(id))
      : [];
    return valid.includes(activeId) ? valid.slice(0, 12) : [activeId, ...valid].slice(0, 12);
  } catch {
    return [activeId];
  }
}

function saveThreadList(ids: string[]) {
  try {
    window.localStorage.setItem(THREAD_LIST_STORAGE, JSON.stringify(ids.slice(0, 12)));
  } catch {
    // Non-secret thread ID cache is optional.
  }
}

async function issueToken(threadId: string): Promise<TokenResponse> {
  const response = await fetch("/api/chat/session-token", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ threadId }),
  });
  if (!response.ok) {
    throw new Error(response.status === 401
      ? "Your sign-in has expired. Sign in again."
      : response.status === 503
        ? "Cloudflare Keyless chat is not configured."
        : "Could not authorize your chat session.");
  }
  const result: unknown = await response.json();
  if (!isTokenResponse(result)) throw new Error("Invalid chat session response.");
  return result;
}

function EdgeConversation({
  host,
  session,
  threadId,
  threads,
  onSelectThread,
  onNewThread,
  onSwitchToByok,
}: {
  host: string;
  session: TokenResponse;
  threadId: string;
  threads: string[];
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onSwitchToByok?: () => void;
}) {
  const [input, setInput] = useState("");
  const [messageError, setMessageError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [quota, setQuota] = useState<Quota | null>(null);
  const submitting = useRef(false);
  const requestToken = useCallback(() => issueToken(threadId), [threadId]);

  const agent = useAgent({
    agent: "ChatAgent",
    name: `${session.userId}:${threadId}`,
    host,
    query: async () => ({ token: (await requestToken()).token }),
    queryDeps: [session.userId, threadId],
    cacheTtl: 30_000,
  });

  const { messages, sendMessage, status, stop, clearHistory, isServerStreaming } = useAgentChat({
    agent,
    resume: true,
    prepareSendMessagesRequest: async () => ({
      body: { token: (await requestToken()).token },
    }),
  });

  const refreshQuota = useCallback(async () => {
    try {
      const issued = await requestToken();
      const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http:" : "https:";
      const res = await fetch(`${protocol}//${host}/usage`, {
        headers: { Authorization: `Bearer ${issued.token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const result: unknown = await res.json();
      if (result && typeof result === "object" && "remaining" in result) {
        const data = result as Partial<Quota>;
        if (typeof data.remaining === "number" && typeof data.used === "number" &&
            typeof data.remainingBudgetMicros === "number") setQuota(data as Quota);
      }
    } catch {
      // Usage telemetry must not block the chat experience.
    }
  }, [host, requestToken]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  const busy = status === "submitted" || status === "streaming" || isServerStreaming;
  const quotaExhausted = quota?.remaining === 0;

  async function submitText() {
    if (!input.trim() || busy || submitting.current || quotaExhausted) return;
    submitting.current = true;
    setMessageError("");
    try {
      await sendMessage({ text: input.trim() });
      setInput("");
      void refreshQuota();
    } catch {
      setMessageError("Message could not be sent. Please retry.");
    } finally {
      submitting.current = false;
    }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitText();
  }

  async function copyResponse(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 1600);
    } catch {
      setCopiedId("");
    }
  }

  return (
    <div className="edge-chat-layout">
      <aside className="edge-chat-sidebar" aria-label="Edge conversation threads">
        <div className="edge-chat-sidebar-head">
          <span>THREADS</span>
          <button type="button" onClick={onNewThread} title="New thread">
            <MessageSquarePlus size={14} /> New
          </button>
        </div>
        <div className="edge-chat-thread-list" role="listbox" aria-label="Saved thread IDs">
          {threads.map((id, idx) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={id === threadId}
              className={id === threadId ? "active" : ""}
              onClick={() => onSelectThread(id)}
            >
              <span>Thread {threads.length - idx}</span>
              <small>{id.slice(0, 8)}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="edge-chat" aria-label="Cloudflare Keyless Chat">
        <div className="edge-chat-toolbar">
          <div className="edge-chat-title">
            <span>Cloudflare Edge • GLM-4.7-Flash</span>
            <StatusBadge status={busy ? "building" : quotaExhausted ? "error" : "ready"}>
              {busy ? "Streaming" : quotaExhausted ? "Quota reached" : "Keyless"}
            </StatusBadge>
          </div>
          <div>
            <span className="edge-chat-quota" aria-live="polite">
              {quota ? `${quota.remaining}/30 questions left today` : "Checking daily quota…"}
            </span>
            <button type="button" onClick={() => { void clearHistory(); setMessageError(""); }} disabled={busy}>
              <Trash2 size={13} /> Clear history
            </button>
          </div>
        </div>

        <div className="edge-chat-transcript" role="log" aria-live="polite" aria-label="Chat messages">
          {messages.length === 0 ? (
            <div className="edge-chat-empty">
              <h2>Ask the edge agent</h2>
              <p>History is stored in this user&apos;s Cloudflare Durable Object SQLite instance. Reconnect to the same thread to continue.</p>
            </div>
          ) : messages.map(message => {
            const fullText = message.parts
              .filter((part): part is { type: "text"; text: string } => part.type === "text")
              .map(part => part.text)
              .join("\n");
            return (
              <article className="edge-chat-message" data-role={message.role} key={message.id}>
                <p className="edge-chat-role">{message.role === "user" ? "You" : "GLM-4.7-Flash"}</p>
                {message.parts.map((part, i) => part.type === "text"
                  ? <Streamdown key={i}>{part.text}</Streamdown>
                  : null)}
                {message.role !== "user" && fullText ? (
                  <button
                    type="button"
                    className="message-copy"
                    onClick={() => { void copyResponse(message.id, fullText); }}
                  >
                    {copiedId === message.id ? <Check size={11} /> : <Copy size={11} />}
                    {copiedId === message.id ? "Copied" : "Copy response"}
                  </button>
                ) : null}
              </article>
            );
          })}
          {busy ? <p className="edge-chat-working">Generating response…</p> : null}
        </div>

        {quotaExhausted && (
          <div className="edge-chat-error" role="status">
            Daily 30-question Edge limit reached.{" "}
            {onSwitchToByok && (
              <button type="button" className="edge-chat-switch-link" onClick={onSwitchToByok}>
                Switch to BYOK mode
              </button>
            )}
          </div>
        )}
        {messageError ? <p className="edge-chat-error" role="alert">{messageError}</p> : null}

        <form className="edge-chat-form" onSubmit={send}>
          <label htmlFor="edge-chat-message">Message</label>
          <textarea
            id="edge-chat-message"
            value={input}
            onChange={event => setInput(event.target.value)}
            maxLength={INPUT_LIMIT}
            rows={3}
            placeholder="What would you like to build?"
            disabled={quotaExhausted}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submitText();
              }
            }}
          />
          <div className="edge-chat-form-actions">
            <span>{input.length}/{INPUT_LIMIT} · Shift + Enter for a new line</span>
            {busy
              ? <button type="button" onClick={() => stop()}><Square size={12} fill="currentColor" /> Stop</button>
              : <button type="submit" disabled={!input.trim() || quotaExhausted}>Send</button>}
          </div>
        </form>
      </section>
    </div>
  );
}

export default function KeylessChat({ onSwitchToByok }: { onSwitchToByok?: () => void }) {
  const [threadId, setThreadId] = useState("");
  const [threads, setThreads] = useState<string[]>([]);
  const [session, setSession] = useState<TokenResponse | null>(null);
  const [error, setError] = useState("");
  const hostValue = process.env.NEXT_PUBLIC_CF_AGENT_URL;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THREAD_STORAGE);
      const initial = stored && /^[a-z0-9_-]{1,64}$/i.test(stored) ? stored : newThreadId();
      const list = readThreadList(initial);
      saveThreadList(list);
      setThreads(list);
      setThreadId(initial);
    } catch {
      const initial = newThreadId();
      setThreads([initial]);
      setThreadId(initial);
    }
  }, []);

  useEffect(() => {
    if (!threadId) return;
    let active = true;
    setSession(null);
    setError("");
    void issueToken(threadId)
      .then(value => { if (active) setSession(value); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to establish chat session.");
      });
    return () => { active = false; };
  }, [threadId]);

  function selectThread(id: string) {
    try { window.localStorage.setItem(THREAD_STORAGE, id); } catch { /* optional thread metadata */ }
    setThreadId(id);
  }

  function newThread() {
    const id = newThreadId();
    const nextList = [id, ...threads.filter(item => item !== id)].slice(0, 12);
    saveThreadList(nextList);
    setThreads(nextList);
    selectThread(id);
  }

  if (!hostValue || !/^https?:\/\//.test(hostValue)) {
    return <p className="edge-chat-error">Keyless chat is not configured. Select BYOK mode.</p>;
  }
  const host = new URL(hostValue).host;
  if (error) return (
    <div className="edge-chat-empty" role="alert">
      <p>{error}</p>
      <Link href="/login">Sign in</Link>
      <button type="button" onClick={newThread}>Retry with a new thread</button>
    </div>
  );
  if (!session) return <div className="edge-chat-empty" role="status">Authorizing Edge chat…</div>;

  return (
    <EdgeConversation
      key={threadId}
      host={host}
      session={session}
      threadId={threadId}
      threads={threads}
      onSelectThread={selectThread}
      onNewThread={newThread}
      onSwitchToByok={onSwitchToByok}
    />
  );
}
