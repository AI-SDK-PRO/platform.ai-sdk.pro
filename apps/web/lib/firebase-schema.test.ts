import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FieldValue } from "firebase/firestore";
import {
  buildAccountPayload,
  buildNotePayload,
  buildPresetPayload,
  FIREBASE_LIMITS,
} from "./firebase";

const rootDir = path.resolve(__dirname, "../../..");
const stubTimestamp = {} as FieldValue;

describe("Firebase blueprint and security rules synchronization", () => {
  it("synchronizes firebase-blueprint.json limits with client payload builders", () => {
    const blueprintRaw = fs.readFileSync(
      path.join(rootDir, "firebase-blueprint.json"),
      "utf8"
    );
    const blueprint = JSON.parse(blueprintRaw) as {
      entities: {
        UserAccount: { properties: Record<string, { maxLength?: number }> };
        PromptPreset: {
          properties: Record<string, { maxLength?: number; enum?: string[] }>;
        };
        WorkspaceNote: { properties: Record<string, { maxLength?: number }> };
      };
      firestore: Record<string, unknown>;
    };

    expect(blueprint.entities.UserAccount.properties.displayName.maxLength).toBe(
      FIREBASE_LIMITS.displayNameMaxLength
    );
    expect(blueprint.entities.UserAccount.properties.aboutMe.maxLength).toBe(
      FIREBASE_LIMITS.aboutMeMaxLength
    );
    expect(blueprint.entities.UserAccount.properties.email.maxLength).toBe(
      FIREBASE_LIMITS.emailMaxLength
    );
    expect(blueprint.entities.PromptPreset.properties.title.maxLength).toBe(
      FIREBASE_LIMITS.presetTitleMaxLength
    );
    expect(blueprint.entities.PromptPreset.properties.prompt.maxLength).toBe(
      FIREBASE_LIMITS.presetPromptMaxLength
    );
    expect(blueprint.entities.PromptPreset.properties.providerPreference.enum).toEqual([
      ...FIREBASE_LIMITS.providers,
    ]);
    expect(blueprint.entities.WorkspaceNote.properties.body.maxLength).toBe(
      FIREBASE_LIMITS.noteBodyMaxLength
    );
    expect(Object.keys(blueprint.firestore)).toEqual([
      "/users/{userId}/private/{docId}",
      "/users/{userId}/presets/{presetId}",
      "/users/{userId}/notes/{noteId}",
    ]);
  });

  it("enforces truncation and ID guards without accepting secrets", () => {
    const account = buildAccountPayload({
      uid: "user_123",
      displayName: "A".repeat(200),
      aboutMe: "B".repeat(600),
      email: "user@example.com",
      updatedAt: stubTimestamp,
    });
    expect(account.displayName.length).toBe(FIREBASE_LIMITS.displayNameMaxLength);
    expect(account.aboutMe?.length).toBe(FIREBASE_LIMITS.aboutMeMaxLength);

    const preset = buildPresetPayload({
      id: "preset_1",
      ownerId: "user_123",
      title: "T".repeat(150),
      prompt: "P".repeat(2500),
      providerPreference: "edge-glm",
      createdAt: stubTimestamp,
      updatedAt: stubTimestamp,
    });
    expect(preset.title.length).toBe(FIREBASE_LIMITS.presetTitleMaxLength);
    expect(preset.prompt.length).toBe(FIREBASE_LIMITS.presetPromptMaxLength);
    expect("apiKey" in preset).toBe(false);

    const note = buildNotePayload({
      id: "note_1",
      ownerId: "user_123",
      repositorySlug: "z-ey3eiei/ai-sdk-pro",
      body: "Note text",
      updatedAt: stubTimestamp,
    });
    expect(note.repositorySlug).toBe("z-ey3eiei/ai-sdk-pro");

    expect(() =>
      buildPresetPayload({
        id: "../bad",
        ownerId: "user_123",
        title: "Test",
        prompt: "Prompt",
        providerPreference: "edge-glm",
        updatedAt: stubTimestamp,
      })
    ).toThrow(/Invalid preset id/);
  });

  it("covers all blueprint collections in firestore.rules with default-deny and verified ownership", () => {
    const rules = fs.readFileSync(path.join(rootDir, "firestore.rules"), "utf8");
    expect(rules).toContain("rules_version = '2';");
    expect(rules).toContain("match /{document=**} {\n      allow read, write: if false;\n    }");
    expect(rules).toContain("request.auth.token.email_verified == true");
    expect(rules).toContain("match /users/{userId}/private/{docId}");
    expect(rules).toContain("match /users/{userId}/presets/{presetId}");
    expect(rules).toContain("match /users/{userId}/notes/{noteId}");
    expect(rules).toContain("allow list: if isOwner(userId) && existing().ownerId == request.auth.uid;");
  });
});
