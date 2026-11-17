"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { Flame, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { EmptyStateBox, GeistCard, SkeletonBlock, StatusBadge } from "@aisdkpro/ui";
import { useFirebase } from "./FirebaseProvider";
import {
  buildPresetPayload,
  db,
  FIREBASE_LIMITS,
  handleFirestoreError,
  OperationType,
  type FirebaseProviderPreference,
} from "../lib/firebase";

interface SavedPreset {
  id: string;
  ownerId: string;
  title: string;
  prompt: string;
  providerPreference: FirebaseProviderPreference;
}

export default function FirebaseSyncPanel() {
  const { user, authReady, connected, busy, authError, signInWithGoogle, signOutFirebase } =
    useFirebase();
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [providerPreference, setProviderPreference] =
    useState<FirebaseProviderPreference>("edge-glm");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  if (asyncError) {
    throw asyncError;
  }

  useEffect(() => {
    if (!authReady || !user) {
      setPresets([]);
      setLoadingPresets(false);
      return;
    }
    setLoadingPresets(true);
    const presetsPath = `users/${user.uid}/presets`;
    const presetsQuery = query(
      collection(db, "users", user.uid, "presets"),
      where("ownerId", "==", user.uid),
      orderBy("updatedAt", "desc")
    );
    const unsubscribe = onSnapshot(
      presetsQuery,
      snapshot => {
        const items: SavedPreset[] = snapshot.docs.map(item => {
          const data = item.data();
          return {
            id: item.id,
            ownerId: String(data.ownerId ?? ""),
            title: String(data.title ?? ""),
            prompt: String(data.prompt ?? ""),
            providerPreference: FIREBASE_LIMITS.providers.includes(
              data.providerPreference as FirebaseProviderPreference
            )
              ? (data.providerPreference as FirebaseProviderPreference)
              : "edge-glm",
          };
        });
        setPresets(items);
        setLoadingPresets(false);
      },
      error => {
        setLoadingPresets(false);
        try {
          handleFirestoreError(error, OperationType.LIST, presetsPath);
        } catch (wrapped) {
          setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
    return () => unsubscribe();
  }, [authReady, user]);

  async function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;
    setFormError("");
    setSaving(true);
    const id = `preset-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const path = `users/${user.uid}/presets/${id}`;
    try {
      const payload = buildPresetPayload({
        id,
        ownerId: user.uid,
        title,
        prompt,
        providerPreference,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "users", user.uid, "presets", id), payload);
      setTitle("");
      setPrompt("");
    } catch (error) {
      if (error instanceof Error && error.message.includes("Missing or insufficient permissions")) {
        try {
          handleFirestoreError(error, OperationType.CREATE, path);
        } catch (wrapped) {
          setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      } else {
        setFormError(error instanceof Error ? error.message : "Could not save preset.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function removePreset(id: string) {
    if (!user) return;
    const path = `users/${user.uid}/presets/${id}`;
    try {
      await deleteDoc(doc(db, "users", user.uid, "presets", id));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, path);
      } catch (wrapped) {
        setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  }

  return (
    <GeistCard className="workspace-account-card">
      <div className="workspace-firebase-head">
        <h2>
          <Flame size={20} /> Firebase Cloud Sync (Prompt Presets)
        </h2>
        <StatusBadge
          status={connected === false ? "error" : user ? "ready" : "byok"}
        >
          {connected === false
            ? "Offline"
            : user
              ? "Firestore connected"
              : "Google Auth ready"}
        </StatusBadge>
      </div>
      <p>
        บันทึก Prompt Presets ส่วนตัวลง Firestore แบบ Per-user Isolation ไม่มีการจัดเก็บ API keys หรือ Secrets ลงฐานข้อมูลโดยเด็ดขาด
      </p>

      {authError && (
        <p role="alert" className="workspace-account-error">
          {authError}
        </p>
      )}
      {formError && (
        <p role="alert" className="workspace-account-error">
          {formError}
        </p>
      )}

      {!authReady ? (
        <div className="workspace-firebase-skeletons">
          <SkeletonBlock height={36} width="220px" />
          <SkeletonBlock height={72} />
        </div>
      ) : !user ? (
        <div className="workspace-firebase-auth">
          <button
            type="button"
            className="workspace-button workspace-button-primary"
            disabled={busy}
            onClick={() => {
              void signInWithGoogle();
            }}
          >
            {busy ? <LoaderCircle className="workspace-spin" size={15} /> : <Flame size={15} />}
            Sign in with Google (Firebase)
          </button>
        </div>
      ) : (
        <div className="workspace-firebase-signed-in">
          <div className="workspace-account-state">
            <span>Google: {user.email || user.displayName || user.uid}</span>
            <button
              type="button"
              className="workspace-button workspace-button-secondary"
              disabled={busy}
              onClick={() => {
                void signOutFirebase();
              }}
            >
              Sign out Firebase
            </button>
          </div>

          <form className="workspace-account-form" onSubmit={event => { void savePreset(event); }}>
            <label htmlFor="firebase-preset-title">Preset title</label>
            <input
              id="firebase-preset-title"
              type="text"
              required
              maxLength={FIREBASE_LIMITS.presetTitleMaxLength}
              placeholder="e.g., Security audit checklist"
              value={title}
              onChange={event => setTitle(event.target.value)}
            />
            <label htmlFor="firebase-preset-provider">Preferred mode label (no secrets)</label>
            <select
              id="firebase-preset-provider"
              value={providerPreference}
              onChange={event =>
                setProviderPreference(event.target.value as FirebaseProviderPreference)
              }
            >
              <option value="edge-glm">Cloudflare Edge (GLM-4.7-Flash)</option>
              <option value="openai">BYOK · OpenAI</option>
              <option value="anthropic">BYOK · Anthropic</option>
              <option value="google">BYOK · Google Gemini</option>
            </select>
            <label htmlFor="firebase-preset-prompt">Prompt template</label>
            <textarea
              id="firebase-preset-prompt"
              required
              rows={3}
              maxLength={FIREBASE_LIMITS.presetPromptMaxLength}
              placeholder="Enter a reusable prompt for /chat..."
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
            />
            <button
              type="submit"
              className="workspace-button workspace-button-primary"
              disabled={saving || !title.trim() || !prompt.trim()}
            >
              {saving ? <LoaderCircle className="workspace-spin" size={15} /> : <Plus size={15} />}
              Save preset to Firestore
            </button>
          </form>

          <div className="workspace-firebase-presets">
            {loadingPresets ? (
              <SkeletonBlock height={56} />
            ) : presets.length === 0 ? (
              <EmptyStateBox
                title="No saved presets yet"
                description="Save your frequently used system or architecture prompts to reuse them directly in the playground."
                icon={<Flame size={20} />}
              />
            ) : (
              presets.map(item => (
                <div className="workspace-firebase-preset-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span className="workspace-firebase-provider-tag">
                      {item.providerPreference}
                    </span>
                    <p>{item.prompt}</p>
                  </div>
                  <div className="workspace-firebase-preset-actions">
                    <Link
                      href={`/chat?prompt=${encodeURIComponent(item.prompt)}`}
                      className="workspace-button workspace-button-secondary"
                    >
                      Open in Chat
                    </Link>
                    <button
                      type="button"
                      className="workspace-icon-button"
                      aria-label={`Delete preset ${item.title}`}
                      onClick={() => {
                        void removePreset(item.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </GeistCard>
  );
}
