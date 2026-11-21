// Historical Firestore payload policy, retained only for legacy rule regression tests.
type FieldValue = unknown;
export const FIREBASE_LIMITS = {
  idPattern: /^[a-zA-Z0-9_-]{1,128}$/,
  idMaxLength: 128,
  displayNameMaxLength: 120,
  aboutMeMaxLength: 500,
  emailMaxLength: 254,
  presetTitleMaxLength: 80,
  presetPromptMaxLength: 2000,
  noteBodyMaxLength: 2000,
  repositorySlugMaxLength: 140,
  providers: ["edge-glm", "openai", "anthropic", "google"] as const,
} as const;

export type FirebaseProviderPreference = (typeof FIREBASE_LIMITS.providers)[number];

export interface UserAccountDoc {
  uid: string;
  displayName: string;
  aboutMe?: string;
  email: string;
  updatedAt: FieldValue;
}

export interface PromptPresetDoc {
  id: string;
  ownerId: string;
  title: string;
  prompt: string;
  providerPreference: FirebaseProviderPreference;
  createdAt?: FieldValue;
  updatedAt: FieldValue;
}

export interface WorkspaceNoteDoc {
  id: string;
  ownerId: string;
  repositorySlug?: string;
  body: string;
  createdAt?: FieldValue;
  updatedAt: FieldValue;
}

function assertValidId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!FIREBASE_LIMITS.idPattern.test(trimmed)) {
    throw new Error(`Invalid ${label} format.`);
  }
  return trimmed;
}

export function buildAccountPayload(input: {
  uid: string;
  displayName?: string | null;
  aboutMe?: string | null;
  email: string;
  updatedAt: FieldValue;
}): UserAccountDoc {
  const uid = assertValidId(input.uid, "uid");
  const email = input.email.trim().slice(0, FIREBASE_LIMITS.emailMaxLength);
  if (email.length < 3) throw new Error("Verified email is required.");
  const displayName = (input.displayName ?? "")
    .trim()
    .slice(0, FIREBASE_LIMITS.displayNameMaxLength);
  const aboutMe = (input.aboutMe ?? "")
    .trim()
    .slice(0, FIREBASE_LIMITS.aboutMeMaxLength);
  return {
    uid,
    displayName,
    ...(aboutMe ? { aboutMe } : {}),
    email,
    updatedAt: input.updatedAt,
  };
}

export function buildPresetPayload(input: {
  id: string;
  ownerId: string;
  title: string;
  prompt: string;
  providerPreference: FirebaseProviderPreference;
  createdAt?: FieldValue;
  updatedAt: FieldValue;
}): PromptPresetDoc {
  const id = assertValidId(input.id, "preset id");
  const ownerId = assertValidId(input.ownerId, "ownerId");
  const title = input.title.trim().slice(0, FIREBASE_LIMITS.presetTitleMaxLength);
  const prompt = input.prompt.trim().slice(0, FIREBASE_LIMITS.presetPromptMaxLength);
  if (!title) throw new Error("Preset title is required.");
  if (!prompt) throw new Error("Preset prompt is required.");
  if (!FIREBASE_LIMITS.providers.includes(input.providerPreference)) {
    throw new Error("Unsupported provider preference.");
  }
  return {
    id,
    ownerId,
    title,
    prompt,
    providerPreference: input.providerPreference,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    updatedAt: input.updatedAt,
  };
}

export function buildNotePayload(input: {
  id: string;
  ownerId: string;
  repositorySlug?: string;
  body: string;
  createdAt?: FieldValue;
  updatedAt: FieldValue;
}): WorkspaceNoteDoc {
  const id = assertValidId(input.id, "note id");
  const ownerId = assertValidId(input.ownerId, "ownerId");
  const body = input.body.trim().slice(0, FIREBASE_LIMITS.noteBodyMaxLength);
  if (!body) throw new Error("Note body is required.");
  const slug = input.repositorySlug
    ?.trim()
    .slice(0, FIREBASE_LIMITS.repositorySlugMaxLength);
  return {
    id,
    ownerId,
    ...(slug ? { repositorySlug: slug } : {}),
    body,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    updatedAt: input.updatedAt,
  };
}
