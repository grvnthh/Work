import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";
import {
  buildResolvedCanvasItemsFromStore,
  extractMediaKeyFromUrl,
  mergeCmsStores,
  normalizeStore,
  settleStoreNonOverlappingPositions,
  type CanvasCmsStoreData,
} from "@/lib/cms-storage";
import { fetchAndCacheDriveFile } from "@/lib/drive-cms/media-cache";

interface InMemoryMediaEntry {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

const globalState = globalThis as unknown as {
  __GRVNTH_CMS_STORE__?: CanvasCmsStoreData;
  __GRVNTH_CLOUD_STORE_CACHE__?: { store: CanvasCmsStoreData | null; fetchedAt: number };
  __GRVNTH_MEDIA_MAP__?: Map<string, InMemoryMediaEntry>;
  __GRVNTH_CHUNK_MAP__?: Map<string, Buffer[]>;
};

function getMemoryMediaMap(): Map<string, InMemoryMediaEntry> {
  if (!globalState.__GRVNTH_MEDIA_MAP__) {
    globalState.__GRVNTH_MEDIA_MAP__ = new Map<string, InMemoryMediaEntry>();
  }
  return globalState.__GRVNTH_MEDIA_MAP__;
}

function getChunkMap(): Map<string, Buffer[]> {
  if (!globalState.__GRVNTH_CHUNK_MAP__) {
    globalState.__GRVNTH_CHUNK_MAP__ = new Map<string, Buffer[]>();
  }
  return globalState.__GRVNTH_CHUNK_MAP__;
}

function safeDecodeURIComponent(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

const CMS_SNAPSHOT_PREFIX = "cms-showcase-store-v8-";
const SUPABASE_FALLBACK_URL = "https://jnolhqtsuyfckytngssa.supabase.co";
const SUPABASE_FALLBACK_KEY = "sb_publishable_UtllKtAciWXasnSJ1VY35g_P5tiVA9W";
const SUPABASE_BUCKET = "contact-attachments";
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

function getServerSupabaseCredentials(): { url: string; key: string } {
  const metaEnv = (
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}
  ) as Record<string, string | undefined>;
  const url = (
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    metaEnv["VITE_SUPABASE_URL"] ||
    SUPABASE_FALLBACK_URL
  ).replace(/\/+$/, "");
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    metaEnv["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    SUPABASE_FALLBACK_KEY;
  return { url, key };
}

function buildSupabaseHeaders(key: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    ...(extra ?? {}),
  };
  if (!key.startsWith("sb_publishable_")) {
    headers["Authorization"] = `Bearer ${key}`;
  }
  return headers;
}

async function createServerSupabaseSignedUrl(storagePath: string): Promise<string | null> {
  const { url, key } = getServerSupabaseCredentials();
  try {
    const res = await fetch(`${url}/storage/v1/object/sign/${SUPABASE_BUCKET}/${storagePath}`, {
      method: "POST",
      headers: buildSupabaseHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: TEN_YEARS_SECONDS }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { signedURL?: string } | null;
    if (data?.signedURL) {
      return `${url}/storage/v1${data.signedURL}`;
    }
  } catch {
    // Ignore error
  }
  return null;
}

async function uploadBufferToSupabaseStorage(
  _folder: "inquiries" | "cms",
  uniqueName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const { url, key } = getServerSupabaseCredentials();
  try {
    // Always use inquiries/ prefix with x-upsert: false to satisfy public RLS INSERT/SELECT policies
    const storagePath = `inquiries/${uniqueName}`;
    const res = await fetch(`${url}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`, {
      method: "POST",
      headers: buildSupabaseHeaders(key, {
        "Content-Type": mimeType || "application/octet-stream",
        "x-upsert": "false",
      }),
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (
        !errText.toLowerCase().includes("already exists") &&
        !errText.toLowerCase().includes("duplicate")
      ) {
        return null;
      }
    }

    return await createServerSupabaseSignedUrl(storagePath);
  } catch {
    return null;
  }
}

async function getSupabaseStorageSignedUrl(
  folder: "inquiries" | "cms",
  safeName: string,
): Promise<string | null> {
  const primarySigned = await createServerSupabaseSignedUrl(`inquiries/${safeName}`);
  if (primarySigned) return primarySigned;

  if (folder !== "inquiries") {
    const fallbackSigned = await createServerSupabaseSignedUrl(`${folder}/${safeName}`);
    if (fallbackSigned) return fallbackSigned;
  }
  return null;
}

function extractSnapshotTimestamp(name: string): number {
  const match = name.match(/cms-(?:canvas|showcase)-store-v\d+-0*(\d+)/);
  if (match?.[1]) {
    const parsed = parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

async function listServerSupabaseSnapshots(
  prefixSearch: string,
  limit = 16,
): Promise<Array<{ name: string }>> {
  const { url, key } = getServerSupabaseCredentials();
  try {
    const res = await fetch(`${url}/storage/v1/object/list/${SUPABASE_BUCKET}`, {
      method: "POST",
      headers: buildSupabaseHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        prefix: "inquiries",
        limit,
        offset: 0,
        search: prefixSearch,
        sortBy: { column: "name", order: "desc" },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as Array<{ name?: string }> | null;
    if (!Array.isArray(data)) return [];
    const filtered = data.filter(
      (item): item is { name: string } => typeof item?.name === "string",
    );
    filtered.sort((a, b) => extractSnapshotTimestamp(b.name) - extractSnapshotTimestamp(a.name));
    return filtered;
  } catch {
    return [];
  }
}

async function downloadServerSupabaseText(storagePath: string): Promise<string | null> {
  const { url, key } = getServerSupabaseCredentials();
  try {
    const res = await fetch(`${url}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`, {
      method: "GET",
      headers: buildSupabaseHeaders(key),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function readSupabaseCanvasCmsStore(forceFresh = false): Promise<CanvasCmsStoreData | null> {
  const now = Date.now();
  const cached = globalState.__GRVNTH_CLOUD_STORE_CACHE__;
  if (!forceFresh && cached && now - cached.fetchedAt < 2000) {
    return cached.store;
  }

  try {
    const v6Files = await listServerSupabaseSnapshots(CMS_SNAPSHOT_PREFIX, 16);
    for (const file of v6Files) {
      const text = await downloadServerSupabaseText(`inquiries/${file.name}`);
      if (!text) continue;
      try {
        const parsed = normalizeStore(JSON.parse(text) as Partial<CanvasCmsStoreData>);
        if (new Date(parsed.updatedAt || 0).getTime() > 0) {
          globalState.__GRVNTH_CLOUD_STORE_CACHE__ = { store: parsed, fetchedAt: Date.now() };
          return parsed;
        }
      } catch {
        // Try next snapshot
      }
    }
  } catch {
    // Ignore cloud read error
  }
  return cached?.store ?? null;
}

async function writeSupabaseCanvasCmsStore(store: CanvasCmsStoreData): Promise<void> {
  const { url, key } = getServerSupabaseCredentials();
  try {
    const storeTime = new Date(store.updatedAt || 0).getTime();
    if (storeTime <= 0) return;

    globalState.__GRVNTH_CLOUD_STORE_CACHE__ = { store, fetchedAt: Date.now() };

    const ts = Math.max(Date.now(), storeTime);
    const paddedTs = String(ts).padStart(15, "0");
    const rand = Math.random().toString(36).slice(2, 7);
    const snapName = `${CMS_SNAPSHOT_PREFIX}${paddedTs}-${rand}.json`;
    const payload = Buffer.from(JSON.stringify(store), "utf-8");

    await fetch(`${url}/storage/v1/object/${SUPABASE_BUCKET}/inquiries/${snapName}`, {
      method: "POST",
      headers: buildSupabaseHeaders(key, {
        "Content-Type": "application/json",
        "x-upsert": "false",
      }),
      body: new Uint8Array(payload),
    });
  } catch {
    // Ignore cloud snapshot error
  }
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const CANVAS_CMS_FILE = path.join(DATA_DIR, "canvas-cms.json");

export function readServerCanvasCmsStore(): CanvasCmsStoreData {
  let diskStore: CanvasCmsStoreData | null = null;
  try {
    if (fs.existsSync(CANVAS_CMS_FILE)) {
      const raw = fs.readFileSync(CANVAS_CMS_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CanvasCmsStoreData>;
      diskStore = normalizeStore(parsed);
    }
  } catch {
    // Fall back to in-memory store
  }

  const memStore = globalState.__GRVNTH_CMS_STORE__ ?? null;
  if (diskStore && memStore) {
    const diskTime = new Date(diskStore.updatedAt || 0).getTime();
    const memTime = new Date(memStore.updatedAt || 0).getTime();
    const best = memTime >= diskTime ? memStore : diskStore;
    settleStoreNonOverlappingPositions(best);
    globalState.__GRVNTH_CMS_STORE__ = best;
    return best;
  }
  if (diskStore) {
    settleStoreNonOverlappingPositions(diskStore);
    globalState.__GRVNTH_CMS_STORE__ = diskStore;
    return diskStore;
  }
  if (!globalState.__GRVNTH_CMS_STORE__) {
    globalState.__GRVNTH_CMS_STORE__ = normalizeStore(null);
  }
  return globalState.__GRVNTH_CMS_STORE__;
}

export function writeServerCanvasCmsStore(store: CanvasCmsStoreData): CanvasCmsStoreData {
  const next = normalizeStore({
    ...store,
    updatedAt: store.updatedAt || new Date().toISOString(),
  });
  settleStoreNonOverlappingPositions(next);
  globalState.__GRVNTH_CMS_STORE__ = next;

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CANVAS_CMS_FILE, JSON.stringify(next, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Canvas CMS] Memory fallback active (disk write skipped):", err);
  }
  return next;
}

function getMimeTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    case ".avi":
      return "video/x-msvideo";
    case ".ogg":
    case ".ogv":
      return "video/ogg";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    case ".pdf":
      return "application/pdf";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".flac":
      return "audio/flac";
    case ".opus":
      return "audio/opus";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

function getExtFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  switch (normalized) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/svg+xml":
      return ".svg";
    case "image/avif":
      return ".avif";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    case "audio/mpeg":
    case "audio/mp3":
      return ".mp3";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/ogg":
      return ".ogg";
    case "application/pdf":
      return ".pdf";
    case "application/zip":
      return ".zip";
    default:
      return "";
  }
}

/**
 * Single-pass streaming saver: reads webStream once chunk-by-chunk, writing
 * directly to disk via file descriptor (for unlimited file sizes with zero RAM limit)
 * while also keeping an in-memory copy for files <= 128 MB so serverless/edge/read-only
 * environments work without ever re-reading or locking the stream.
 */
async function saveStreamOrBuffer(
  webStream: ReadableStream<Uint8Array>,
  targetPaths: string[],
  memoryKey: string,
  mimeType: string,
  filename: string,
  appendMode = false,
): Promise<Buffer | null> {
  const primaryPath = targetPaths[0];
  let fd: number | null = null;

  if (primaryPath) {
    try {
      fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
      fd = fs.openSync(primaryPath, appendMode ? "a" : "w");
    } catch {
      fd = null;
    }
  }

  const reader = webStream.getReader();
  const memoryChunks: Uint8Array[] = [];
  let totalBytes = 0;
  const MAX_MEMORY_CACHE_BYTES = 128 * 1024 * 1024;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        totalBytes += value.byteLength;
        if (fd !== null) {
          try {
            fs.writeSync(fd, value);
          } catch {
            try {
              fs.closeSync(fd);
            } catch {
              // Ignore close error
            }
            fd = null;
          }
        }
        if (totalBytes <= MAX_MEMORY_CACHE_BYTES) {
          memoryChunks.push(value);
        }
      }
    }
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close error
      }
    }
  }

  if (primaryPath && !appendMode && totalBytes === 0) {
    try {
      if (fs.existsSync(primaryPath)) {
        fs.unlinkSync(primaryPath);
      }
    } catch {
      // Ignore cleanup error
    }
    return null;
  }

  let buffer: Buffer | null = null;
  if (memoryChunks.length > 0 && totalBytes <= MAX_MEMORY_CACHE_BYTES) {
    buffer = Buffer.concat(memoryChunks);
    if (!appendMode) {
      getMemoryMediaMap().set(memoryKey, {
        buffer,
        mimeType,
        filename,
      });
    }
  }

  if (primaryPath && !appendMode && totalBytes > 0) {
    for (let i = 1; i < targetPaths.length; i++) {
      try {
        if (fs.existsSync(primaryPath)) {
          fs.mkdirSync(path.dirname(targetPaths[i]), { recursive: true });
          fs.copyFileSync(primaryPath, targetPaths[i]);
        }
      } catch {
        // Ignore secondary copy error
      }
    }
  }

  return buffer;
}

function streamBufferEntry(entry: InMemoryMediaEntry, request: Request): Response {
  const totalSize = entry.buffer.byteLength;
  const rangeHeader = request.headers.get("range");

  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${totalSize}` },
      });
    }

    const slice = entry.buffer.subarray(start, end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(slice.byteLength),
        "Content-Type": entry.mimeType,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      },
    });
  }

  return new Response(new Uint8Array(entry.buffer), {
    status: 200,
    headers: {
      "Content-Type": entry.mimeType,
      "Content-Length": String(totalSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      "Content-Disposition": `inline; filename="${encodeURIComponent(entry.filename)}"`,
    },
  });
}

function streamLocalFile(filePath: string, mimeType: string, filename: string, request: Request) {
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const rangeHeader = request.headers.get("range");

  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${totalSize}`,
        },
      });
    }

    const chunksize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new Response(readableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  const readableStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
  });

  return new Response(readableStream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(totalSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

export const Route = createFileRoute("/api/drive-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);

        if (url.searchParams.get("cmsState") === "1") {
          let store = readServerCanvasCmsStore();
          const cloudStore = await readSupabaseCanvasCmsStore();
          if (cloudStore) {
            const diskTime = new Date(store.updatedAt || 0).getTime();
            const cloudTime = new Date(cloudStore.updatedAt || 0).getTime();
            if (cloudTime > diskTime) {
              store = mergeCmsStores(store, cloudStore);
              writeServerCanvasCmsStore(store);
            } else if (
              diskTime > cloudTime &&
              (store.addedItems.length > 0 || store.deletedIds.length > 0)
            ) {
              void writeSupabaseCanvasCmsStore(store);
            }
          }
          const resolved = buildResolvedCanvasItemsFromStore(store);
          return Response.json(resolved);
        }

        const inquiryFile = url.searchParams.get("inquiry");
        if (inquiryFile) {
          const safeName = path.basename(inquiryFile);
          const inquiryPath = path.resolve(process.cwd(), "data", "inquiries", safeName);
          try {
            if (fs.existsSync(inquiryPath) && fs.statSync(inquiryPath).size > 0) {
              const ext = path.extname(safeName);
              return streamLocalFile(inquiryPath, getMimeTypeFromExt(ext), safeName, request);
            }
          } catch {
            // Check memory map next
          }
          const memEntry = getMemoryMediaMap().get(safeName);
          if (memEntry && memEntry.buffer.byteLength > 0) {
            return streamBufferEntry(memEntry, request);
          }
          const supabaseSignedUrl = await getSupabaseStorageSignedUrl("inquiries", safeName);
          if (supabaseSignedUrl) {
            return Response.redirect(supabaseSignedUrl, 302);
          }
          return new Response("Attachment not found", { status: 404 });
        }

        const localFile = url.searchParams.get("local");
        if (localFile) {
          const safeName = path.basename(localFile);
          const isCheckOnly = url.searchParams.get("check") === "1";
          const cmsMediaPath = path.resolve(process.cwd(), "data", "cms-media", safeName);
          const publicMediaPath = path.resolve(process.cwd(), "public", "media", safeName);
          const ext = path.extname(safeName);

          try {
            if (fs.existsSync(cmsMediaPath)) {
              const stat = fs.statSync(cmsMediaPath);
              if (stat.size > 0) {
                if (isCheckOnly) {
                  return Response.json({ exists: true, size: stat.size });
                }
                return streamLocalFile(cmsMediaPath, getMimeTypeFromExt(ext), safeName, request);
              }
            }
            if (fs.existsSync(publicMediaPath)) {
              const stat = fs.statSync(publicMediaPath);
              if (stat.size > 0) {
                if (isCheckOnly) {
                  return Response.json({ exists: true, size: stat.size });
                }
                return streamLocalFile(publicMediaPath, getMimeTypeFromExt(ext), safeName, request);
              }
            }
          } catch {
            // Fall through to memory map
          }

          const memEntry = getMemoryMediaMap().get(safeName);
          if (memEntry && memEntry.buffer.byteLength > 0) {
            if (isCheckOnly) {
              return Response.json({ exists: true, size: memEntry.buffer.byteLength });
            }
            return streamBufferEntry(memEntry, request);
          }

          const supabaseSignedUrl = await getSupabaseStorageSignedUrl("cms", safeName);
          if (supabaseSignedUrl) {
            if (isCheckOnly) {
              return Response.json({ exists: true, size: 1 });
            }
            return Response.redirect(supabaseSignedUrl, 302);
          }

          if (isCheckOnly) {
            return Response.json({ exists: false, size: 0 });
          }

          return new Response("Media not found", { status: 404 });
        }

        const fileId = url.searchParams.get("id");
        const filename = url.searchParams.get("name") || "";

        if (!fileId) {
          return new Response("Missing file id", { status: 400 });
        }

        const cached = await fetchAndCacheDriveFile(fileId, null, filename);
        if (!cached || !fs.existsSync(cached.filePath)) {
          return new Response("Media not found", { status: 404 });
        }

        return streamLocalFile(
          cached.filePath,
          cached.meta.mimeType || "application/octet-stream",
          cached.meta.filename || fileId,
          request,
        );
      },

      POST: async ({ request }) => {
        try {
          const reqUrl = new URL(request.url);

          if (reqUrl.searchParams.get("cmsState") === "1") {
            const body = (await request.json()) as {
              action?: string;
              store?: CanvasCmsStoreData;
              urlMap?: Record<string, string>;
            };

            if (body?.action === "upgradeMediaUrls" && body.urlMap) {
              const urlMap = body.urlMap;
              const current = readServerCanvasCmsStore();
              let modified = false;

              for (let i = 0; i < current.addedItems.length; i += 1) {
                const item = current.addedItems[i];
                const primaryKey = extractMediaKeyFromUrl(item.videoUrl || item.imageUrl);
                if (primaryKey && urlMap[primaryKey]) {
                  const upgraded = urlMap[primaryKey];
                  if (item.imageUrl !== upgraded || (item.videoUrl && item.videoUrl !== upgraded)) {
                    current.addedItems[i] = {
                      ...item,
                      imageUrl: upgraded,
                      ...(item.mediaType === "video" || item.videoUrl
                        ? { videoUrl: upgraded }
                        : {}),
                    };
                    modified = true;
                  }
                }

                if (
                  current.addedItems[i].extraMedia &&
                  current.addedItems[i].extraMedia!.length > 0
                ) {
                  const updatedExtras = [...current.addedItems[i].extraMedia!];
                  let extrasChanged = false;
                  for (let eIdx = 0; eIdx < updatedExtras.length; eIdx += 1) {
                    const extra = updatedExtras[eIdx];
                    const extraKey = extractMediaKeyFromUrl(extra.videoUrl || extra.imageUrl);
                    if (extraKey && urlMap[extraKey]) {
                      const upgradedExtra = urlMap[extraKey];
                      if (extra.imageUrl !== upgradedExtra) {
                        updatedExtras[eIdx] = {
                          ...extra,
                          imageUrl: upgradedExtra,
                          ...(extra.mediaType === "video" || extra.videoUrl
                            ? { videoUrl: upgradedExtra }
                            : {}),
                        };
                        extrasChanged = true;
                        modified = true;
                      }
                    }
                  }
                  if (extrasChanged) {
                    current.addedItems[i] = {
                      ...current.addedItems[i],
                      extraMedia: updatedExtras,
                    };
                  }
                }
              }

              if (modified) {
                const saved = writeServerCanvasCmsStore(current);
                void writeSupabaseCanvasCmsStore(saved);
                return Response.json(buildResolvedCanvasItemsFromStore(saved));
              }
              return Response.json(buildResolvedCanvasItemsFromStore(current));
            }

            if (body?.store) {
              const incoming = normalizeStore(body.store);
              incoming.updatedAt = body.store.updatedAt || new Date().toISOString();
              const saved = writeServerCanvasCmsStore(incoming);
              await writeSupabaseCanvasCmsStore(saved);
              return Response.json(buildResolvedCanvasItemsFromStore(saved));
            }
            const current = readServerCanvasCmsStore();
            return Response.json(buildResolvedCanvasItemsFromStore(current));
          }

          const headerFileName = request.headers.get("x-file-name");
          const queryFileName = reqUrl.searchParams.get("filename");
          const requestedLocalKey = reqUrl.searchParams.get("localKey");
          const rawStreamFileName = queryFileName
            ? safeDecodeURIComponent(queryFileName)
            : headerFileName
              ? safeDecodeURIComponent(headerFileName)
              : null;

          const uploadId = reqUrl.searchParams.get("uploadId");
          const chunkIndexParam = reqUrl.searchParams.get("chunkIndex");
          const totalChunksParam = reqUrl.searchParams.get("totalChunks");
          const isChunked =
            Boolean(uploadId) && chunkIndexParam !== null && totalChunksParam !== null;

          // Direct binary stream mode (supports both single-pass and multi-chunk uploads)
          if (rawStreamFileName && request.body) {
            const isInquiry = reqUrl.searchParams.get("purpose") === "inquiry";
            const fileType = request.headers.get("x-file-type") || "";
            const origExt = path.extname(rawStreamFileName).toLowerCase();

            if (isInquiry) {
              const inquiriesDir = path.resolve(process.cwd(), "data", "inquiries");
              const safeExt =
                origExt.replace(/[^.a-z0-9]/g, "") || getExtFromMimeType(fileType) || ".bin";
              const rawBase = path.basename(rawStreamFileName, origExt);
              const safeSlug =
                rawBase
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "")
                  .slice(0, 48) || "attachment";

              const safeUploadId = uploadId
                ? uploadId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36)
                : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const uniqueName = `inquiry-${safeUploadId}-${safeSlug}${safeExt}`;
              const resolvedMime = fileType || getMimeTypeFromExt(safeExt);
              const targetPath = path.join(inquiriesDir, uniqueName);

              if (isChunked) {
                const chunkIndex = parseInt(chunkIndexParam!, 10);
                const totalChunks = parseInt(totalChunksParam!, 10);
                const chunkBuffer = await saveStreamOrBuffer(
                  request.body,
                  [targetPath],
                  uniqueName,
                  resolvedMime,
                  rawStreamFileName,
                  chunkIndex > 0,
                );

                const chunkMap = getChunkMap();
                if (chunkIndex === 0) {
                  chunkMap.set(uniqueName, chunkBuffer ? [chunkBuffer] : []);
                } else if (chunkBuffer) {
                  const existing = chunkMap.get(uniqueName) ?? [];
                  existing.push(chunkBuffer);
                  chunkMap.set(uniqueName, existing);
                }

                if (chunkIndex < totalChunks - 1) {
                  return Response.json({
                    partial: true,
                    chunkIndex,
                    totalChunks,
                    filename: uniqueName,
                  });
                }

                let fullBuffer: Buffer | null = null;
                const accumulated = chunkMap.get(uniqueName);
                chunkMap.delete(uniqueName);

                try {
                  if (fs.existsSync(targetPath)) {
                    const stat = fs.statSync(targetPath);
                    if (stat.size <= 50 * 1024 * 1024) {
                      fullBuffer = fs.readFileSync(targetPath);
                    }
                  }
                } catch {
                  // Ignore fs read error
                }
                if (!fullBuffer && accumulated && accumulated.length > 0) {
                  fullBuffer = Buffer.concat(accumulated);
                }

                if (fullBuffer && fullBuffer.byteLength <= 128 * 1024 * 1024) {
                  getMemoryMediaMap().set(uniqueName, {
                    buffer: fullBuffer,
                    mimeType: resolvedMime,
                    filename: rawStreamFileName,
                  });
                }

                const supabaseUrl =
                  fullBuffer && fullBuffer.byteLength <= 50 * 1024 * 1024
                    ? await uploadBufferToSupabaseStorage(
                        "inquiries",
                        uniqueName,
                        fullBuffer,
                        resolvedMime,
                      )
                    : null;

                return Response.json({
                  files: [
                    {
                      filename: uniqueName,
                      url:
                        supabaseUrl || `/api/drive-media?inquiry=${encodeURIComponent(uniqueName)}`,
                      mimeType: resolvedMime,
                      title: rawStreamFileName,
                    },
                  ],
                });
              }

              const savedBuffer = await saveStreamOrBuffer(
                request.body,
                [targetPath],
                uniqueName,
                resolvedMime,
                rawStreamFileName,
              );

              const supabaseUrl =
                savedBuffer && savedBuffer.byteLength <= 50 * 1024 * 1024
                  ? await uploadBufferToSupabaseStorage(
                      "inquiries",
                      uniqueName,
                      savedBuffer,
                      resolvedMime,
                    )
                  : null;

              return Response.json({
                files: [
                  {
                    filename: uniqueName,
                    url:
                      supabaseUrl || `/api/drive-media?inquiry=${encodeURIComponent(uniqueName)}`,
                    mimeType: resolvedMime,
                    title: rawStreamFileName,
                  },
                ],
              });
            }

            const cmsMediaDir = path.resolve(process.cwd(), "data", "cms-media");

            const isVideo =
              fileType.startsWith("video/") ||
              [".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogg", ".ogv"].includes(origExt);
            const safeExt = origExt.replace(/[^.a-z0-9]/g, "") || (isVideo ? ".mp4" : ".png");
            const rawBase = path.basename(rawStreamFileName, origExt);
            const cleanTitle =
              rawBase.replace(/[-_]+/g, " ").trim() ||
              (isVideo ? "Studio Video" : "Studio Artwork");
            const safeSlug =
              rawBase
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 42) || "media";

            const uniqueName = requestedLocalKey
              ? path.basename(requestedLocalKey)
              : `cms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeSlug}${safeExt}`;
            const resolvedMime = fileType || getMimeTypeFromExt(safeExt);
            const targetFilePath = path.join(cmsMediaDir, uniqueName);

            if (isChunked) {
              const chunkIndex = parseInt(chunkIndexParam!, 10);
              const totalChunks = parseInt(totalChunksParam!, 10);
              await saveStreamOrBuffer(
                request.body,
                [targetFilePath],
                uniqueName,
                resolvedMime,
                uniqueName,
                chunkIndex > 0,
              );

              if (chunkIndex < totalChunks - 1) {
                return Response.json({
                  partial: true,
                  chunkIndex,
                  totalChunks,
                  filename: uniqueName,
                });
              }

              let cloudSignedUrl: string | null = null;
              try {
                if (fs.existsSync(targetFilePath)) {
                  const stat = fs.statSync(targetFilePath);
                  if (stat.size > 0 && stat.size <= 50 * 1024 * 1024) {
                    const fullBuf = fs.readFileSync(targetFilePath);
                    cloudSignedUrl = await uploadBufferToSupabaseStorage(
                      "cms",
                      uniqueName,
                      fullBuf,
                      resolvedMime,
                    );
                  }
                }
              } catch {
                // Ignore optional cloud upload error for large files
              }

              return Response.json({
                files: [
                  {
                    filename: uniqueName,
                    url:
                      cloudSignedUrl || `/api/drive-media?local=${encodeURIComponent(uniqueName)}`,
                    mediaType: isVideo ? "video" : "image",
                    mimeType: resolvedMime,
                    title: cleanTitle,
                  },
                ],
              });
            }

            const savedCmsBuffer = await saveStreamOrBuffer(
              request.body,
              [targetFilePath],
              uniqueName,
              resolvedMime,
              uniqueName,
            );

            let cloudSignedUrl: string | null = null;
            if (savedCmsBuffer && savedCmsBuffer.byteLength <= 50 * 1024 * 1024) {
              cloudSignedUrl = await uploadBufferToSupabaseStorage(
                "cms",
                uniqueName,
                savedCmsBuffer,
                resolvedMime,
              );
            }

            return Response.json({
              files: [
                {
                  filename: uniqueName,
                  url: cloudSignedUrl || `/api/drive-media?local=${encodeURIComponent(uniqueName)}`,
                  mediaType: isVideo ? "video" : "image",
                  mimeType: resolvedMime,
                  title: cleanTitle,
                },
              ],
            });
          }

          // Multipart FormData mode
          const formData = await request.formData();
          const isInquiry =
            reqUrl.searchParams.get("purpose") === "inquiry" ||
            formData.get("purpose") === "inquiry";

          const entries = formData.getAll("files");
          const singleFile = formData.get("file");
          const rawFiles = [...entries, ...(singleFile ? [singleFile] : [])].filter(
            (item): item is File => item instanceof File && item.size > 0,
          );

          if (rawFiles.length === 0) {
            return Response.json({ error: "No media files provided" }, { status: 400 });
          }

          if (isInquiry) {
            const inquiriesDir = path.resolve(process.cwd(), "data", "inquiries");
            const uploaded: Array<{
              filename: string;
              url: string;
              mimeType: string;
              title: string;
            }> = [];

            for (const file of rawFiles) {
              const origExt = path.extname(file.name).toLowerCase();
              const safeExt =
                origExt.replace(/[^.a-z0-9]/g, "") || getExtFromMimeType(file.type) || ".bin";
              const rawBase = path.basename(file.name, origExt);
              const safeSlug =
                rawBase
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "")
                  .slice(0, 48) || "attachment";

              const uniqueName = `inquiry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeSlug}${safeExt}`;
              const resolvedMime = file.type || getMimeTypeFromExt(safeExt);
              const savedBuffer = await saveStreamOrBuffer(
                file.stream(),
                [path.join(inquiriesDir, uniqueName)],
                uniqueName,
                resolvedMime,
                file.name,
              );

              const supabaseUrl =
                savedBuffer && savedBuffer.byteLength <= 50 * 1024 * 1024
                  ? await uploadBufferToSupabaseStorage(
                      "inquiries",
                      uniqueName,
                      savedBuffer,
                      resolvedMime,
                    )
                  : null;

              uploaded.push({
                filename: uniqueName,
                url: supabaseUrl || `/api/drive-media?inquiry=${encodeURIComponent(uniqueName)}`,
                mimeType: resolvedMime,
                title: file.name,
              });
            }

            return Response.json({ files: uploaded });
          }

          const cmsMediaDir = path.resolve(process.cwd(), "data", "cms-media");

          const uploaded: Array<{
            filename: string;
            url: string;
            mediaType: "image" | "video";
            mimeType: string;
            title: string;
          }> = [];

          for (const file of rawFiles) {
            const origExt = path.extname(file.name).toLowerCase();
            const isVideo =
              file.type.startsWith("video/") ||
              [".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogg", ".ogv"].includes(origExt);
            const safeExt = origExt.replace(/[^.a-z0-9]/g, "") || (isVideo ? ".mp4" : ".png");
            const rawBase = path.basename(file.name, origExt);
            const cleanTitle =
              rawBase.replace(/[-_]+/g, " ").trim() ||
              (isVideo ? "Studio Video" : "Studio Artwork");
            const safeSlug =
              rawBase
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 42) || "media";

            const uniqueName =
              requestedLocalKey && rawFiles.length === 1
                ? path.basename(requestedLocalKey)
                : `cms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeSlug}${safeExt}`;
            const resolvedMime = file.type || getMimeTypeFromExt(safeExt);
            const savedCmsBuffer = await saveStreamOrBuffer(
              file.stream(),
              [path.join(cmsMediaDir, uniqueName)],
              uniqueName,
              resolvedMime,
              uniqueName,
            );

            let cloudSignedUrl: string | null = null;
            if (savedCmsBuffer && savedCmsBuffer.byteLength <= 50 * 1024 * 1024) {
              cloudSignedUrl = await uploadBufferToSupabaseStorage(
                "cms",
                uniqueName,
                savedCmsBuffer,
                resolvedMime,
              );
            }

            uploaded.push({
              filename: uniqueName,
              url: cloudSignedUrl || `/api/drive-media?local=${encodeURIComponent(uniqueName)}`,
              mediaType: isVideo ? "video" : "image",
              mimeType: resolvedMime,
              title: cleanTitle,
            });
          }

          return Response.json({ files: uploaded });
        } catch (error) {
          console.error("[CMS Upload] Error saving media:", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Upload failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
