"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
type Preset = {
  id: string;
  title: string;
  prompt: string;
  providerPreference: string;
};
export default function NeonSyncPanel() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [providerPreference, setProvider] = useState("openai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch("/api/platform/presets", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("อ่าน preset จาก Neon ไม่สำเร็จ กรุณาตรวจ migration");
    setPresets((await response.json()).presets);
  }
  useEffect(() => {
    void load().catch(() => setError("อ่าน preset จาก Neon ไม่สำเร็จ"));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/presets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, prompt, providerPreference }),
      });
      if (!response.ok)
        throw new Error("บันทึกไม่ได้ (สูงสุด 100 preset ต่อบัญชี)");
      setTitle("");
      setPrompt("");
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/platform/presets?id=" + encodeURIComponent(id),
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!response.ok) throw new Error("Delete failed.");
      await load();
    } catch {
      setError("ลบ preset ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-account-card">
      <h2>Private presets · Neon</h2>
      <p>บันทึก prompt ส่วนตัวใน Neon Postgres ไม่ควรใส่รหัสผ่านหรือ API key</p>
      {error && <p role="alert">{error}</p>}
      <form className="workspace-account-form" onSubmit={save}>
        <label htmlFor="preset-title">Preset title</label>
        <input
          id="preset-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          maxLength={80}
        />
        <label htmlFor="preset-provider">Preferred mode</label>
        <select
          id="preset-provider"
          value={providerPreference}
          onChange={e => setProvider(e.target.value)}
        >
          <option value="edge-glm">Cloudflare Edge</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google Gemini</option>
        </select>
        <label htmlFor="preset-prompt">Prompt template</label>
        <textarea
          id="preset-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          required
          maxLength={2000}
        />
        <button
          className="workspace-button workspace-button-primary"
          disabled={busy}
        >
          Save preset to Neon
        </button>
      </form>
      {presets.map(item => (
        <article key={item.id} className="workspace-account-card">
          <strong>{item.title}</strong>
          <p>{item.prompt}</p>
          <Link href={`/chat?prompt=${encodeURIComponent(item.prompt)}`}>
            Open in Chat
          </Link>{" "}
          <button
            disabled={busy}
            onClick={() => {
              void remove(item.id);
            }}
            aria-label={`Delete preset ${item.title}`}
          >
            Delete
          </button>
        </article>
      ))}
    </section>
  );
}
