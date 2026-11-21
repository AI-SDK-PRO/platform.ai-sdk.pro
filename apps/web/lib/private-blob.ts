import "server-only";
import { randomUUID } from "node:crypto";
import {
  acceptableBlobSignature,
  blobUserPrefix,
  MAX_USER_BLOB_BYTES,
  ownedBlobPath,
  privateBlobUploadPath,
} from "./blob-policy";

// MOCKED — in-memory Map stub replacing @vercel/blob, data lost on container sleep
interface StoredBlobEntry {
  pathname: string;
  data: Uint8Array;
  mime: string;
  uploadedAt: Date;
}

const blobStore = new Map<string, StoredBlobEntry>();

export function privateBlobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() &&
      process.env.BLOB_READ_WRITE_TOKEN.trim().length >= 30
  );
}

export async function listPrivateBlobs(userId: string) {
  const prefix = blobUserPrefix(userId);
  const files = Array.from(blobStore.values())
    .filter(
      entry => entry.pathname.startsWith(prefix) && ownedBlobPath(userId, entry.pathname)
    )
    .slice(0, 50)
    .map(entry => ({
      pathname: entry.pathname,
      name: entry.pathname.split("/").pop() || "file",
      size: entry.data.byteLength,
      uploadedAt: entry.uploadedAt,
    }));
  return {
    files,
    hasMore: false,
  };
}

export async function uploadPrivateBlob(
  userId: string,
  filename: string,
  mime: string,
  data: Uint8Array
) {
  if (
    !data.byteLength ||
    data.byteLength > MAX_USER_BLOB_BYTES ||
    !acceptableBlobSignature(data, mime)
  ) {
    throw new Error("The file format or size is not allowed.");
  }
  const basePath = privateBlobUploadPath(userId, filename);
  const dot = basePath.lastIndexOf(".");
  const suffix = randomUUID().slice(0, 8);
  const pathname =
    dot > basePath.lastIndexOf("/")
      ? `${basePath.slice(0, dot)}-${suffix}${basePath.slice(dot)}`
      : `${basePath}-${suffix}`;

  if (!ownedBlobPath(userId, pathname)) {
    throw new Error("The storage response is invalid.");
  }

  blobStore.set(pathname, {
    pathname,
    data: Uint8Array.from(data),
    mime,
    uploadedAt: new Date(),
  });

  return {
    pathname,
    name: pathname.split("/").pop(),
    size: data.byteLength,
  };
}

export async function downloadPrivateBlob(userId: string, pathname: string) {
  if (!ownedBlobPath(userId, pathname)) return null;
  const entry = blobStore.get(pathname);
  if (!entry) return null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(entry.data);
      controller.close();
    },
  });
  return {
    statusCode: 200 as const,
    stream,
    blob: {
      pathname: entry.pathname,
      contentType: entry.mime,
      size: entry.data.byteLength,
      uploadedAt: entry.uploadedAt,
    },
  };
}
