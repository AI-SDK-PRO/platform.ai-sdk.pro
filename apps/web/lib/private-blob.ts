import "server-only";
import { get, list, put } from "@vercel/blob";
import {
  acceptableBlobSignature,
  blobUserPrefix,
  MAX_USER_BLOB_BYTES,
  ownedBlobPath,
  privateBlobUploadPath,
} from "./blob-policy";

export function privateBlobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() &&
      process.env.BLOB_READ_WRITE_TOKEN.trim().length >= 30
  );
}

export async function listPrivateBlobs(userId: string) {
  const result = await list({ prefix: blobUserPrefix(userId), limit: 50 });
  return {
    files: result.blobs
      .filter(blob => ownedBlobPath(userId, blob.pathname))
      .map(blob => ({
        pathname: blob.pathname,
        name: blob.pathname.split("/").pop() || "file",
        size: blob.size,
        uploadedAt: blob.uploadedAt,
      })),
    hasMore: result.hasMore,
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

  // Persist externally; never retain upload bodies in process-wide state.
  const blob = await put(
    privateBlobUploadPath(userId, filename),
    Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    { access: "private", contentType: mime, addRandomSuffix: true }
  );
  if (!ownedBlobPath(userId, blob.pathname)) {
    throw new Error("The storage response is invalid.");
  }

  return {
    pathname: blob.pathname,
    name: blob.pathname.split("/").pop(),
    size: data.byteLength,
  };
}

export async function downloadPrivateBlob(userId: string, pathname: string) {
  if (!ownedBlobPath(userId, pathname)) return null;
  return get(pathname, { access: "private" });
}
