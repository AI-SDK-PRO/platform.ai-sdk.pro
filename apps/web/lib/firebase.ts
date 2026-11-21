import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { getAuth, GithubAuthProvider, GoogleAuthProvider, type Auth } from "firebase/auth";
import {
  doc,
  getDocFromServer,
  getFirestore,
  type FieldValue,
  type Firestore,
} from "firebase/firestore";
import firebaseConfig from "../../../firebase-applet-config.json";

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let appCheckInstance: AppCheck | null = null;

export function getFirebaseAppCheckSiteKey(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY?.trim() ||
    (firebaseConfig as { recaptchaSiteKey?: string }).recaptchaSiteKey?.trim() ||
    ""
  );
}

export function ensureAppCheck(): AppCheck | null {
  if (typeof window === "undefined" || appCheckInstance) return appCheckInstance;
  const siteKey = getFirebaseAppCheckSiteKey();
  if (!siteKey) return null;
  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("Firebase App Check initialization skipped:", error instanceof Error ? error.message : String(error));
  }
  return appCheckInstance;
}

if (typeof window !== "undefined") {
  ensureAppCheck();
}

export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
export const githubProvider = new GithubAuthProvider();
githubProvider.addScope("user:email");
githubProvider.setCustomParameters({ allow_signup: "true" });

export { app, firebaseConfig };

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const user = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid ?? null,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      tenantId: user?.tenantId ?? null,
      providerInfo:
        user?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  const serialized = JSON.stringify(errInfo);
  console.error("Firestore Error: ", serialized);
  throw new Error(serialized);
}

let connectionTested = false;

export async function testConnection(): Promise<boolean> {
  if (connectionTested) return true;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.", error);
      return false;
    }
    return true;
  }
}

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
