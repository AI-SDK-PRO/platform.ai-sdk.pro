import { beforeEach, describe, expect, it, vi } from "vitest";
import { get, list, put } from "@vercel/blob";
import {
  blobUserPrefix,
  MAX_USER_BLOB_BYTES,
  ownedBlobPath,
} from "./blob-policy";
import { downloadPrivateBlob, uploadPrivateBlob } from "./private-blob";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

const owner = "userOwner01";
const pathname = blobUserPrefix(owner) + "file-id/report.pdf";
const data = new TextEncoder().encode("%PDF-1.7");

beforeEach(() => vi.resetAllMocks());

describe("private Blob storage", () => {
  it("persists every repeated upload externally with private access", async () => {
    vi.mocked(put).mockImplementation(async path => ({
      pathname: path,
      url: "https://store.private.blob.vercel-storage.com/" + path,
      downloadUrl: "https://store.private.blob.vercel-storage.com/" + path,
      contentType: "application/pdf",
      contentDisposition: "attachment",
      etag: "test-etag",
    }));

    const paths = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const file = await uploadPrivateBlob(
        owner,
        "report.pdf",
        "application/pdf",
        data
      );
      expect(ownedBlobPath(owner, file.pathname)).toBe(true);
      expect(file.size).toBe(data.byteLength);
      expect(file).not.toHaveProperty("url");
      paths.add(file.pathname);
    }
    expect(paths.size).toBe(10);
    expect(put).toHaveBeenCalledTimes(10);
    expect(put).toHaveBeenLastCalledWith(
      expect.any(String),
      Buffer.from(data),
      {
        access: "private",
        contentType: "application/pdf",
        addRandomSuffix: true,
      }
    );
  });

  it("rejects invalid uploads before writing to storage", async () => {
    for (const invalid of [
      new Uint8Array(),
      new Uint8Array(MAX_USER_BLOB_BYTES + 1),
      new TextEncoder().encode("<html>"),
    ]) {
      await expect(
        uploadPrivateBlob(owner, "report.pdf", "application/pdf", invalid)
      ).rejects.toThrow("format or size");
    }
    await expect(
      uploadPrivateBlob("../other", "report.pdf", "application/pdf", data)
    ).rejects.toThrow("namespace");
    expect(put).not.toHaveBeenCalled();
  });

  it("propagates storage failures instead of reporting a locally retained upload", async () => {
    vi.mocked(put).mockRejectedValue(new Error("Storage unavailable"));
    await expect(
      uploadPrivateBlob(owner, "report.pdf", "application/pdf", data)
    ).rejects.toThrow("Storage unavailable");
  });

  it("rejects a storage response outside the owner's namespace", async () => {
    vi.mocked(put).mockResolvedValue({
      pathname: "users/otherUser/uploads/report.pdf",
    } as Awaited<ReturnType<typeof put>>);
    await expect(
      uploadPrivateBlob(owner, "report.pdf", "application/pdf", data)
    ).rejects.toThrow("storage response");
  });

  it("lists only bounded owner metadata from external storage, including after module reload", async () => {
    const uploadedAt = new Date("2026-01-01T00:00:00Z");
    vi.mocked(list).mockResolvedValue({
      blobs: [
        { pathname, size: 8, uploadedAt },
        { pathname: "users/otherUser/uploads/secret.pdf", size: 8, uploadedAt },
        {
          pathname: blobUserPrefix(owner) + "../secret.pdf",
          size: 8,
          uploadedAt,
        },
      ],
      hasMore: true,
    } as Awaited<ReturnType<typeof list>>);
    vi.resetModules();
    const reloaded = await import("./private-blob");
    expect(await reloaded.listPrivateBlobs(owner)).toEqual({
      files: [{ pathname, name: "report.pdf", size: 8, uploadedAt }],
      hasMore: true,
    });
    expect(list).toHaveBeenCalledWith({
      prefix: blobUserPrefix(owner),
      limit: 50,
    });
  });

  it("streams private downloads without buffering them in the application", async () => {
    const stream = new ReadableStream<Uint8Array>();
    const result = { statusCode: 200, stream, blob: { pathname } } as Awaited<
      ReturnType<typeof get>
    >;
    vi.mocked(get).mockResolvedValue(result);
    expect(await downloadPrivateBlob(owner, pathname)).toBe(result);
    expect(get).toHaveBeenCalledWith(pathname, { access: "private" });
  });

  it("does not query storage for cross-user or traversal downloads", async () => {
    expect(await downloadPrivateBlob("otherUser01", pathname)).toBeNull();
    expect(
      await downloadPrivateBlob(owner, blobUserPrefix(owner) + "../secret.pdf")
    ).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("preserves not-found results from external storage", async () => {
    vi.mocked(get).mockResolvedValue(null);
    expect(await downloadPrivateBlob(owner, pathname)).toBeNull();
  });
});
