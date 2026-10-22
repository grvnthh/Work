import {
  CANVAS_DIMENSIONS,
  computeAspectDimensions,
  doesRectOverlapAny,
  expandCanvasProjects,
  findRandomCanvasPosition,
  PORTFOLIO_CANVAS_PROJECTS,
  resolveNonOverlappingProjects,
  type CanvasExtraMediaItem,
  type CanvasRect,
  type PortfolioCanvasProject,
  type PortfolioCanvasProjectInput,
} from "@/data/portfolioProjects";

export interface CanvasCmsStoreData {
  addedItems: PortfolioCanvasProject[];
  deletedIds: string[];
  overrides: Record<string, Partial<PortfolioCanvasProject>>;
  updatedAt: string;
  lastFocusedId?: string;
}

export interface ResolvedCanvasCmsState {
  items: PortfolioCanvasProject[];
  deletedDefaultCount: number;
  updatedAt: string;
  lastFocusedId?: string;
  store: CanvasCmsStoreData;
}

export interface UploadedMediaDescriptor {
  url: string;
  mediaType: "image" | "video";
  title: string;
  width: number;
  height: number;
}

const LOCAL_STORAGE_KEY = "grvnth_canvas_cms_store_v3";
const BROADCAST_CHANNEL_NAME = "grvnth_canvas_cms_channel";
const IDB_NAME = "grvnth_cms_media_idb";
const IDB_STORE = "media_files";

let memoryStore: CanvasCmsStoreData | null = null;
const undoHistoryStack: CanvasCmsStoreData[] = [];
let mutationVersion = 0;
let pendingPushPromise: Promise<void> | null = null;
const objectUrlCache = new Map<string, string>();
let broadcastChannel: BroadcastChannel | null = null;

function pushUndoSnapshot(store: CanvasCmsStoreData): void {
  undoHistoryStack.push(cloneStore(store));
  if (undoHistoryStack.length > 20) {
    undoHistoryStack.shift();
  }
}

export function canUndoCmsAction(): boolean {
  return undoHistoryStack.length > 0;
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

function createEmptyStore(): CanvasCmsStoreData {
  return {
    addedItems: [],
    deletedIds: [],
    overrides: {},
    updatedAt: new Date(0).toISOString(),
  };
}

function cloneStore(store: CanvasCmsStoreData): CanvasCmsStoreData {
  return JSON.parse(JSON.stringify(store)) as CanvasCmsStoreData;
}

export function normalizeStore(
  raw: Partial<CanvasCmsStoreData> | null | undefined,
): CanvasCmsStoreData {
  if (!raw || typeof raw !== "object") {
    return createEmptyStore();
  }
  return {
    addedItems: Array.isArray(raw.addedItems) ? [...raw.addedItems] : [],
    deletedIds: Array.isArray(raw.deletedIds) ? [...raw.deletedIds] : [],
    overrides: raw.overrides && typeof raw.overrides === "object" ? { ...raw.overrides } : {},
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    ...(typeof raw.lastFocusedId === "string" ? { lastFocusedId: raw.lastFocusedId } : {}),
  };
}

export function readLocalCmsStore(): CanvasCmsStoreData {
  if (typeof window === "undefined") {
    return cloneStore(memoryStore ?? createEmptyStore());
  }

  let bestStore: CanvasCmsStoreData = memoryStore ? cloneStore(memoryStore) : createEmptyStore();
  let bestTime = new Date(bestStore.updatedAt || 0).getTime();

  const tryReadStorage = (storage: Storage, key: string) => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return;
      const parsed = normalizeStore(JSON.parse(raw) as Partial<CanvasCmsStoreData>);
      const t = new Date(parsed.updatedAt || 0).getTime();
      if (t >= bestTime) {
        bestStore = parsed;
        bestTime = t;
      }
    } catch {
      // Ignore storage access errors
    }
  };

  try {
    tryReadStorage(window.localStorage, LOCAL_STORAGE_KEY);
  } catch {
    // Ignore localStorage restrictions
  }

  try {
    tryReadStorage(window.sessionStorage, LOCAL_STORAGE_KEY);
  } catch {
    // Ignore sessionStorage restrictions
  }

  memoryStore = cloneStore(bestStore);
  return cloneStore(bestStore);
}

function persistStoreLocally(store: CanvasCmsStoreData): void {
  memoryStore = cloneStore(store);
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(store);
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
  } catch {
    // Ignore quota or iframe errors
  }
  try {
    window.sessionStorage.setItem(LOCAL_STORAGE_KEY, serialized);
  } catch {
    // Ignore quota or iframe errors
  }
}

export function broadcastCanvasCmsUpdate(
  items: PortfolioCanvasProject[],
  focusedId?: string,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("canvas-cms-updated", {
      detail: items,
    }),
  );
  if (focusedId) {
    window.dispatchEvent(
      new CustomEvent("canvas-cms-focus-item", {
        detail: { id: focusedId, items },
      }),
    );
  }
}

export function writeLocalCmsStore(
  store: CanvasCmsStoreData,
  focusedId?: string,
): CanvasCmsStoreData {
  mutationVersion += 1;
  const next: CanvasCmsStoreData = {
    ...cloneStore(store),
    updatedAt: new Date().toISOString(),
  };
  persistStoreLocally(next);

  const resolved = buildResolvedCanvasItemsFromStore(next);
  broadcastCanvasCmsUpdate(resolved.items, focusedId);

  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage({
        type: "cms-store-updated",
        store: next,
        focusedId,
      });
    } catch {
      // Ignore broadcast errors
    }
  }

  return next;
}

if (typeof window !== "undefined") {
  const ch = getBroadcastChannel();
  if (ch) {
    ch.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        store?: Partial<CanvasCmsStoreData>;
        focusedId?: string;
      } | null;
      if (data?.type === "cms-store-updated" && data.store) {
        const incoming = normalizeStore(data.store);
        const current = readLocalCmsStore();
        const incomingTime = new Date(incoming.updatedAt || 0).getTime();
        const currentTime = new Date(current.updatedAt || 0).getTime();
        if (incomingTime >= currentTime) {
          persistStoreLocally(incoming);
          const resolved = buildResolvedCanvasItemsFromStore(incoming);
          broadcastCanvasCmsUpdate(resolved.items, data.focusedId);
        }
      }
    };
  }
}

function getAllOccupiedRects(items: PortfolioCanvasProject[]): CanvasRect[] {
  return expandCanvasProjects(items).map((p) => ({
    canvasX: p.canvasX,
    canvasY: p.canvasY,
    width: p.width,
    height: p.height,
  }));
}

/**
 * Finds a visibly distinct random non-overlapping position on the canvas,
 * preferring the active central studio region so randomized/uploaded items are immediately visible.
 */
function findDistinctRandomCanvasPosition(
  existingRects: CanvasRect[],
  width: number,
  height: number,
  previousPos?: { canvasX: number; canvasY: number },
  preferCenterZone = false,
): { canvasX: number; canvasY: number } {
  const minGap = 68;
  const minDistanceFromPrevious = previousPos ? 360 : 0;

  if (preferCenterZone) {
    const centerMinX = Math.max(140, CANVAS_DIMENSIONS.initialFocusX - 1050);
    const centerMaxX = Math.min(
      CANVAS_DIMENSIONS.width - width - 140,
      CANVAS_DIMENSIONS.initialFocusX + 850,
    );
    const centerMinY = Math.max(140, CANVAS_DIMENSIONS.initialFocusY - 720);
    const centerMaxY = Math.min(
      CANVAS_DIMENSIONS.height - height - 140,
      CANVAS_DIMENSIONS.initialFocusY + 620,
    );

    for (let attempt = 0; attempt < 350; attempt += 1) {
      const candidateX = Math.round(centerMinX + Math.random() * (centerMaxX - centerMinX));
      const candidateY = Math.round(centerMinY + Math.random() * (centerMaxY - centerMinY));
      if (previousPos) {
        const dist = Math.hypot(candidateX - previousPos.canvasX, candidateY - previousPos.canvasY);
        if (dist < minDistanceFromPrevious) continue;
      }
      if (!doesRectOverlapAny(candidateX, candidateY, width, height, existingRects, minGap)) {
        return { canvasX: candidateX, canvasY: candidateY };
      }
    }

    // If the central zone is densely packed, pick a distinct coordinate inside the central studio
    // neighborhood so the caller can resolve/nudge any adjacent cards without exiling the item.
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const candidateX = Math.round(centerMinX + Math.random() * (centerMaxX - centerMinX));
      const candidateY = Math.round(centerMinY + Math.random() * (centerMaxY - centerMinY));
      if (previousPos) {
        const dist = Math.hypot(candidateX - previousPos.canvasX, candidateY - previousPos.canvasY);
        if (dist < minDistanceFromPrevious) continue;
      }
      return { canvasX: candidateX, canvasY: candidateY };
    }
  }

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const pos = findRandomCanvasPosition(existingRects, width, height, minGap);
    if (previousPos) {
      const dist = Math.hypot(pos.canvasX - previousPos.canvasX, pos.canvasY - previousPos.canvasY);
      if (dist < minDistanceFromPrevious) continue;
    }
    return pos;
  }

  return findRandomCanvasPosition(existingRects, width, height, minGap);
}

/**
 * Resolves any overlaps across the entire store, giving priority to `priorityIds` first
 * and persisting any nudged positions into `store.addedItems` and `store.overrides`
 * so the CMS grid coordinates and Canvas coordinates are 100% identical.
 */
function settleStoreNonOverlappingPositions(
  store: CanvasCmsStoreData,
  priorityIds: string[] = [],
): void {
  const { items } = buildResolvedCanvasItemsFromStore(store);
  const prioritySet = new Set(priorityIds);
  const prioritized = [
    ...items.filter((item) => prioritySet.has(item.id)),
    ...items.filter((item) => !prioritySet.has(item.id)),
  ];

  const settled = resolveNonOverlappingProjects(prioritized, undefined, 68);
  const settledMap = new Map(settled.map((item) => [item.id, item]));

  for (let i = 0; i < store.addedItems.length; i += 1) {
    const updated = settledMap.get(store.addedItems[i].id);
    if (updated) {
      store.addedItems[i] = {
        ...store.addedItems[i],
        canvasX: updated.canvasX,
        canvasY: updated.canvasY,
      };
    }
  }

  for (const baseItem of PORTFOLIO_CANVAS_PROJECTS) {
    const updated = settledMap.get(baseItem.id);
    if (!updated) continue;
    const prevOverride = store.overrides[baseItem.id];
    const changedFromBase =
      updated.canvasX !== baseItem.canvasX || updated.canvasY !== baseItem.canvasY;
    if (changedFromBase || prevOverride) {
      store.overrides[baseItem.id] = {
        ...(prevOverride ?? {}),
        canvasX: updated.canvasX,
        canvasY: updated.canvasY,
      };
    }
  }
}

export function buildResolvedCanvasItemsFromStore(
  store: CanvasCmsStoreData,
): ResolvedCanvasCmsState {
  const deletedSet = new Set(store.deletedIds);

  const resolvedAdded: PortfolioCanvasProject[] = [];
  for (const item of store.addedItems) {
    if (deletedSet.has(item.id)) continue;
    const override = store.overrides[item.id];
    const merged: PortfolioCanvasProject = override
      ? {
          ...item,
          ...override,
          id: item.id,
          extraMedia: (override.extraMedia ?? item.extraMedia ?? []).filter(
            (m) => !deletedSet.has(m.id),
          ),
        }
      : {
          ...item,
          extraMedia: (item.extraMedia ?? []).filter((m) => !deletedSet.has(m.id)),
        };
    resolvedAdded.push(merged);
  }

  return {
    items: resolvedAdded,
    deletedDefaultCount: 0,
    updatedAt: store.updatedAt,
    lastFocusedId: store.lastFocusedId,
    store,
  };
}

// ============================================================================
// IndexedDB Media Blob Cache & Upload Helpers
// ============================================================================

function openMediaIdb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveMediaBlobToIdb(key: string, blob: Blob): Promise<string> {
  const memUrl = URL.createObjectURL(blob);
  objectUrlCache.set(key, memUrl);

  const db = await openMediaIdb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  return memUrl;
}

export function normalizeCmsMediaUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch?.[1]) {
    return `/api/drive-media?id=${encodeURIComponent(driveFileMatch[1])}`;
  }

  if (trimmed.includes("drive.google.com/open") || trimmed.includes("drive.google.com/uc")) {
    try {
      const parsed = new URL(trimmed);
      const id = parsed.searchParams.get("id");
      if (id) {
        return `/api/drive-media?id=${encodeURIComponent(id)}`;
      }
    } catch {
      // Ignore invalid URL
    }
  }

  return trimmed;
}

function getCmsKeySuffix(key: string): string {
  return key.replace(/^cms-\d+-[a-z0-9]+-/i, "").toLowerCase();
}

export async function getMediaBlobFromIdb(
  key: string,
): Promise<{ matchedKey: string; blob: Blob } | null> {
  const db = await openMediaIdb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const objStore = tx.objectStore(IDB_STORE);
      const exactReq = objStore.get(key);

      exactReq.onsuccess = () => {
        if (exactReq.result instanceof Blob && exactReq.result.size > 0) {
          resolve({ matchedKey: key, blob: exactReq.result });
          return;
        }

        // Fallback: check if another key in IDB shares the same filename slug suffix
        const targetSuffix = getCmsKeySuffix(key);
        if (!targetSuffix) {
          resolve(null);
          return;
        }

        const keysReq = objStore.getAllKeys();
        keysReq.onsuccess = () => {
          const allKeys = (keysReq.result ?? []).map((k) => String(k));
          const candidateKey = allKeys.find((k) => getCmsKeySuffix(k) === targetSuffix);
          if (!candidateKey) {
            resolve(null);
            return;
          }
          const fallbackReq = objStore.get(candidateKey);
          fallbackReq.onsuccess = () => {
            if (fallbackReq.result instanceof Blob && fallbackReq.result.size > 0) {
              resolve({ matchedKey: candidateKey, blob: fallbackReq.result });
            } else {
              resolve(null);
            }
          };
          fallbackReq.onerror = () => resolve(null);
        };
        keysReq.onerror = () => resolve(null);
      };
      exactReq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getMediaObjectUrlFromIdb(key: string): Promise<string | null> {
  const cached = objectUrlCache.get(key);
  if (cached) return cached;

  const found = await getMediaBlobFromIdb(key);
  if (!found) return null;

  const existingMatchedUrl = objectUrlCache.get(found.matchedKey);
  const url = existingMatchedUrl ?? URL.createObjectURL(found.blob);
  objectUrlCache.set(key, url);
  objectUrlCache.set(found.matchedKey, url);
  return url;
}

export function extractMediaKeyFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    if (url.includes("local=")) {
      const parsed = new URL(url, "http://localhost");
      return parsed.searchParams.get("local");
    }
    if (url.startsWith("/media/")) {
      return url.slice("/media/".length).split("?")[0];
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export function isLocalCmsMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith("blob:")) return true;
  const key = extractMediaKeyFromUrl(url);
  return Boolean(key && key.startsWith("cms-"));
}

export function getCachedObjectUrlForMedia(url?: string | null): string | null {
  const key = extractMediaKeyFromUrl(url);
  if (!key) return null;
  return objectUrlCache.get(key) ?? null;
}

async function isMediaUrlAvailable(url?: string | null): Promise<boolean> {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("blob:")) {
    try {
      const res = await fetch(trimmed);
      return res.ok;
    } catch {
      return false;
    }
  }

  const key = extractMediaKeyFromUrl(trimmed);
  if (!key || !key.startsWith("cms-")) {
    return true;
  }

  // 1. Check IndexedDB first
  const idbFound = await getMediaBlobFromIdb(key);
  if (idbFound) {
    if (!objectUrlCache.has(key)) {
      const objUrl = URL.createObjectURL(idbFound.blob);
      objectUrlCache.set(key, objUrl);
      objectUrlCache.set(idbFound.matchedKey, objUrl);
    }

    // Ensure server also has a copy of this blob in the background
    void fetch(`/api/drive-media?local=${encodeURIComponent(key)}&check=1`)
      .then((r) => (r.ok ? (r.json() as Promise<{ exists?: boolean }>) : null))
      .then((status) => {
        if (status && status.exists === false) {
          void fetch(
            `/api/drive-media?filename=${encodeURIComponent(key)}&localKey=${encodeURIComponent(key)}`,
            {
              method: "POST",
              headers: {
                "x-file-name": encodeURIComponent(key),
                "x-file-type": idbFound.blob.type || "application/octet-stream",
              },
              body: idbFound.blob,
            },
          ).catch(() => {});
        }
      })
      .catch(() => {});

    return true;
  }

  // 2. Not in IndexedDB: check if the server has the file
  try {
    const checkRes = await fetch(`/api/drive-media?local=${encodeURIComponent(key)}&check=1`, {
      cache: "no-store",
    });
    if (checkRes.ok) {
      const data = (await checkRes.json()) as { exists?: boolean };
      if (data.exists) {
        // Hydrate IndexedDB in the background from server
        void fetch(`/api/drive-media?local=${encodeURIComponent(key)}`)
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (blob && blob.size > 0) {
              void saveMediaBlobToIdb(key, blob);
            }
          })
          .catch(() => {});
        return true;
      }
      return false;
    }
  } catch {
    // Ignore network error
  }

  return false;
}

async function healAndValidateStoreMedia(
  store: CanvasCmsStoreData,
): Promise<{ store: CanvasCmsStoreData; modified: boolean }> {
  if (typeof window === "undefined") {
    return { store, modified: false };
  }

  // Non-destructively hydrate media between IndexedDB and server in the background.
  // Never delete or prune items from addedItems or overrides.
  for (const item of store.addedItems) {
    const primaryUrl = item.videoUrl || item.imageUrl;
    if (primaryUrl) {
      void isMediaUrlAvailable(primaryUrl);
    }
    if (item.extraMedia && item.extraMedia.length > 0) {
      for (const extra of item.extraMedia) {
        const extraUrl = extra.videoUrl || extra.imageUrl;
        if (extraUrl) {
          void isMediaUrlAvailable(extraUrl);
        }
      }
    }
  }

  return { store, modified: false };
}

export function reportUnavailableCmsMedia(_failedUrl?: string | null): void {
  // Never auto-delete CMS items when a media element encounters a transient load error.
}

/**
 * Measures natural aspect ratio of a File (image or video) in the browser
 * and returns canvas-ready dimensions preserving 100% original aspect ratio.
 */
export async function measureFileCanvasDimensions(
  file: File,
  baseSize = 310,
): Promise<{ width: number; height: number; isVideo: boolean }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isVideo =
    file.type.startsWith("video/") ||
    ["mp4", "webm", "mov", "m4v", "mkv", "avi", "ogg", "ogv"].includes(ext);
  const objectUrl = URL.createObjectURL(file);

  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const timeout = window.setTimeout(() => {
        resolve(isVideo ? { width: 270, height: 380 } : { width: 310, height: 310 });
      }, 4000);

      if (isVideo) {
        const tempVideo = document.createElement("video");
        tempVideo.preload = "metadata";
        tempVideo.muted = true;
        tempVideo.playsInline = true;
        tempVideo.onloadedmetadata = () => {
          window.clearTimeout(timeout);
          resolve(
            computeAspectDimensions(
              tempVideo.videoWidth || 720,
              tempVideo.videoHeight || 1280,
              baseSize,
            ),
          );
        };
        tempVideo.onerror = () => {
          window.clearTimeout(timeout);
          resolve({ width: 270, height: 380 });
        };
        tempVideo.src = objectUrl;
      } else {
        const tempImg = new Image();
        tempImg.onload = () => {
          window.clearTimeout(timeout);
          resolve(
            computeAspectDimensions(
              tempImg.naturalWidth || 1000,
              tempImg.naturalHeight || 1000,
              baseSize,
            ),
          );
        };
        tempImg.onerror = () => {
          window.clearTimeout(timeout);
          resolve({ width: 310, height: 310 });
        };
        tempImg.src = objectUrl;
      }
    });

    return { ...dims, isVideo };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Measures natural aspect ratio of a remote or local media URL in the browser.
 */
export async function measureUrlCanvasDimensions(
  url: string,
  mediaType: "image" | "video",
  baseSize = 310,
): Promise<{ width: number; height: number }> {
  const normalizedUrl = normalizeCmsMediaUrl(url);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve(mediaType === "video" ? { width: 270, height: 380 } : { width: 310, height: 310 });
    }, 4000);

    if (mediaType === "video") {
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve(
          computeAspectDimensions(
            tempVideo.videoWidth || 720,
            tempVideo.videoHeight || 1280,
            baseSize,
          ),
        );
      };
      tempVideo.onerror = () => {
        window.clearTimeout(timeout);
        resolve({ width: 270, height: 380 });
      };
      tempVideo.src = normalizedUrl;
    } else {
      const tempImg = new Image();
      tempImg.onload = () => {
        window.clearTimeout(timeout);
        resolve(
          computeAspectDimensions(
            tempImg.naturalWidth || 1000,
            tempImg.naturalHeight || 1000,
            baseSize,
          ),
        );
      };
      tempImg.onerror = () => {
        window.clearTimeout(timeout);
        resolve({ width: 310, height: 310 });
      };
      tempImg.src = normalizedUrl;
    }
  });
}

/**
 * Uploads one or more image/video files to IndexedDB + /api/drive-media using direct binary streaming
 * for maximum capacity (supports multi-GB files without buffering in memory).
 */
export async function uploadMediaFilesToCms(files: File[]): Promise<UploadedMediaDescriptor[]> {
  if (files.length === 0) return [];

  const measuredList = await Promise.all(files.map((file) => measureFileCanvasDimensions(file)));
  const results: UploadedMediaDescriptor[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isVideo =
      file.type.startsWith("video/") ||
      ["mp4", "webm", "mov", "m4v", "mkv", "avi", "ogg", "ogv"].includes(ext);
    const dims = measuredList[index] ?? {
      width: isVideo ? 270 : 310,
      height: isVideo ? 380 : 310,
    };

    const safeExt = ext.replace(/[^a-z0-9]/g, "") || (isVideo ? "mp4" : "png");
    const rawBase = file.name.replace(/\.[^/.]+$/, "");
    const cleanTitle =
      rawBase.replace(/[-_]+/g, " ").trim() || (isVideo ? "Studio Video" : "Studio Artwork");
    const safeSlug =
      rawBase
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 42) || "media";

    const localKey = `cms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeSlug}.${safeExt}`;

    // 1. Immediately cache the binary file in IndexedDB + objectUrlCache for instant zero-latency rendering
    await saveMediaBlobToIdb(localKey, file);

    // 2. Also stream to /api/drive-media so server disk + server memory store it
    let finalUrl = `/api/drive-media?local=${encodeURIComponent(localKey)}`;
    let finalMediaType: "image" | "video" = isVideo ? "video" : "image";
    let finalTitle = cleanTitle;

    try {
      let response = await fetch(
        `/api/drive-media?filename=${encodeURIComponent(file.name)}&localKey=${encodeURIComponent(localKey)}`,
        {
          method: "POST",
          headers: {
            "x-file-name": encodeURIComponent(file.name),
            "x-file-type": file.type || "application/octet-stream",
          },
          body: file,
        },
      ).catch(() => null);

      if (!response || !response.ok) {
        const formData = new FormData();
        formData.append("files", file);
        response = await fetch(`/api/drive-media?localKey=${encodeURIComponent(localKey)}`, {
          method: "POST",
          body: formData,
        }).catch(() => null);
      }

      if (response && response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          files?: Array<{
            filename: string;
            url: string;
            mediaType: "image" | "video";
            title: string;
          }>;
        } | null;

        const uploaded = payload?.files?.[0];
        if (uploaded) {
          if (uploaded.filename && uploaded.filename !== localKey) {
            await saveMediaBlobToIdb(uploaded.filename, file);
          }
          finalUrl = uploaded.url || finalUrl;
          finalMediaType = uploaded.mediaType || finalMediaType;
          finalTitle = uploaded.title || finalTitle;
        }
      }
    } catch {
      // IndexedDB fallback already holds localKey
    }

    results.push({
      url: finalUrl,
      mediaType: finalMediaType,
      title: finalTitle,
      width: dims.width,
      height: dims.height,
    });
  }

  return results;
}

// ============================================================================
// Client + Server Sync Helpers (Sequential & Race-Condition Free)
// ============================================================================

export function mergeCmsStores(
  primary: CanvasCmsStoreData,
  secondary: CanvasCmsStoreData,
): CanvasCmsStoreData {
  const pTime = new Date(primary.updatedAt || 0).getTime();
  const sTime = new Date(secondary.updatedAt || 0).getTime();
  const newer = pTime >= sTime ? primary : secondary;
  const older = pTime >= sTime ? secondary : primary;

  const deletedSet = new Set<string>([...primary.deletedIds, ...secondary.deletedIds]);

  const itemMap = new Map<string, PortfolioCanvasProject>();
  for (const item of older.addedItems) {
    if (!deletedSet.has(item.id)) {
      itemMap.set(item.id, item);
    }
  }
  for (const item of newer.addedItems) {
    if (!deletedSet.has(item.id)) {
      itemMap.set(item.id, item);
    }
  }

  // Preserve order: newer items first, followed by any non-deleted items from older store
  const mergedAddedItems: PortfolioCanvasProject[] = [];
  const seenIds = new Set<string>();
  for (const item of newer.addedItems) {
    if (!deletedSet.has(item.id) && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      mergedAddedItems.push(itemMap.get(item.id)!);
    }
  }
  for (const item of older.addedItems) {
    if (!deletedSet.has(item.id) && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      mergedAddedItems.push(itemMap.get(item.id)!);
    }
  }

  const mergedOverrides: Record<string, Partial<PortfolioCanvasProject>> = {
    ...older.overrides,
    ...newer.overrides,
  };
  for (const delId of deletedSet) {
    delete mergedOverrides[delId];
  }

  const maxTime = Math.max(pTime, sTime, 0);

  return {
    addedItems: mergedAddedItems,
    deletedIds: Array.from(deletedSet),
    overrides: mergedOverrides,
    updatedAt: maxTime > 0 ? new Date(maxTime).toISOString() : new Date(0).toISOString(),
    ...(newer.lastFocusedId && !deletedSet.has(newer.lastFocusedId)
      ? { lastFocusedId: newer.lastFocusedId }
      : older.lastFocusedId && !deletedSet.has(older.lastFocusedId)
        ? { lastFocusedId: older.lastFocusedId }
        : {}),
  };
}

export function pushStoreToServer(store: CanvasCmsStoreData, forceReplace = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const snapshot = cloneStore(store);

  const runPush = async () => {
    try {
      const res = await fetch(`/api/drive-media?cmsState=1&_t=${Date.now()}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: forceReplace ? "forceSetStore" : "setStore",
          store: snapshot,
        }),
      });
      if (res.ok && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("canvas-cms-server-synced", {
            detail: buildResolvedCanvasItemsFromStore(snapshot),
          }),
        );
      }
    } catch {
      // Local store already holds the state
    }
  };

  pendingPushPromise = (pendingPushPromise ?? Promise.resolve()).then(runPush, runPush);
  return pendingPushPromise;
}

export async function loadSynchronizedCmsState(): Promise<ResolvedCanvasCmsState> {
  if (pendingPushPromise) {
    await pendingPushPromise.catch(() => {});
  }

  const versionBeforeFetch = mutationVersion;
  let chosenStore = readLocalCmsStore();

  try {
    const res = await fetch(`/api/drive-media?cmsState=1&_t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
    });

    if (mutationVersion !== versionBeforeFetch) {
      return buildResolvedCanvasItemsFromStore(readLocalCmsStore());
    }

    if (res.ok) {
      const data = (await res.json()) as { store?: Partial<CanvasCmsStoreData> };
      if (mutationVersion !== versionBeforeFetch) {
        return buildResolvedCanvasItemsFromStore(readLocalCmsStore());
      }

      if (data?.store) {
        const serverStore = normalizeStore(data.store);
        const latestLocalStore = readLocalCmsStore();
        chosenStore = mergeCmsStores(latestLocalStore, serverStore);
      }
    }
  } catch {
    // Use localStore on network error
  }

  await healAndValidateStoreMedia(chosenStore);
  persistStoreLocally(chosenStore);
  if (chosenStore.addedItems.length > 0 || chosenStore.deletedIds.length > 0) {
    void pushStoreToServer(chosenStore);
  }
  return buildResolvedCanvasItemsFromStore(chosenStore);
}

// ============================================================================
// Pure Store Mutation Functions (Instant Client Execution + Background Sync)
// ============================================================================

export function mutateAddCanvasItems(
  itemsToAdd: Array<
    PortfolioCanvasProjectInput & {
      extraMedia?: CanvasExtraMediaItem[];
    }
  >,
): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  const { items: currentItems } = buildResolvedCanvasItemsFromStore(store);
  const addedRects = getAllOccupiedRects(currentItems);
  const newPriorityIds: string[] = [];
  let newestId: string | undefined;

  for (const raw of itemsToAdd) {
    const mediaType: "image" | "video" =
      raw.mediaType === "video" ||
      Boolean(raw.videoUrl) ||
      /\.(mp4|webm|mov|m4v|mkv|avi|ogg|ogv)(?:[?#]|$)/i.test(raw.imageUrl || "")
        ? "video"
        : "image";

    const width =
      raw.width && raw.width > 0 ? Math.round(raw.width) : mediaType === "video" ? 270 : 310;
    const height =
      raw.height && raw.height > 0 ? Math.round(raw.height) : mediaType === "video" ? 380 : 310;

    const pos =
      typeof raw.canvasX === "number" && typeof raw.canvasY === "number"
        ? { canvasX: Math.round(raw.canvasX), canvasY: Math.round(raw.canvasY) }
        : findDistinctRandomCanvasPosition(addedRects, width, height, undefined, true);

    addedRects.push({
      canvasX: pos.canvasX,
      canvasY: pos.canvasY,
      width,
      height,
    });

    const resolvedExtra: CanvasExtraMediaItem[] = [];
    if (raw.extraMedia && raw.extraMedia.length > 0) {
      for (const extra of raw.extraMedia) {
        const eWidth =
          extra.width > 0 ? Math.round(extra.width) : extra.mediaType === "video" ? 270 : 310;
        const eHeight =
          extra.height > 0 ? Math.round(extra.height) : extra.mediaType === "video" ? 380 : 310;
        const ePos =
          typeof extra.canvasX === "number" &&
          typeof extra.canvasY === "number" &&
          extra.canvasX > 0 &&
          extra.canvasY > 0
            ? { canvasX: Math.round(extra.canvasX), canvasY: Math.round(extra.canvasY) }
            : findDistinctRandomCanvasPosition(addedRects, eWidth, eHeight, undefined, true);

        addedRects.push({
          canvasX: ePos.canvasX,
          canvasY: ePos.canvasY,
          width: eWidth,
          height: eHeight,
        });

        resolvedExtra.push({
          ...extra,
          id: extra.id || `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          width: eWidth,
          height: eHeight,
          canvasX: ePos.canvasX,
          canvasY: ePos.canvasY,
        });
      }
    }

    const primaryUrl = raw.imageUrl || raw.videoUrl || "/media/showcase-album-2.png";
    const itemId = raw.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    newestId = itemId;
    newPriorityIds.push(itemId);

    const created: PortfolioCanvasProject = {
      id: itemId,
      title: (raw.title || "Untitled Work").trim(),
      description: (raw.description || "").trim(),
      year: (raw.year || new Date().getFullYear().toString()).trim(),
      mediaType,
      imageUrl: primaryUrl,
      videoUrl: mediaType === "video" ? raw.videoUrl || primaryUrl : undefined,
      canvasX: pos.canvasX,
      canvasY: pos.canvasY,
      width,
      height,
      externalUrl: raw.externalUrl?.trim() || undefined,
      extraMedia: resolvedExtra.length > 0 ? resolvedExtra : undefined,
    };

    store.addedItems.unshift(created);
  }

  if (newestId) {
    store.lastFocusedId = newestId;
  }

  settleStoreNonOverlappingPositions(store, newPriorityIds);
  const saved = writeLocalCmsStore(store, newestId);
  void pushStoreToServer(saved);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateUpdateCanvasItem(payload: {
  id: string;
  title?: string;
  description?: string;
  year?: string;
  externalUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: "image" | "video";
  width?: number;
  height?: number;
  canvasX?: number;
  canvasY?: number;
}): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  const addedIndex = store.addedItems.findIndex((item) => item.id === payload.id);

  if (addedIndex !== -1) {
    const current = store.addedItems[addedIndex];
    store.addedItems[addedIndex] = {
      ...current,
      ...(payload.title !== undefined ? { title: payload.title.trim() || current.title } : {}),
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.year !== undefined ? { year: payload.year.trim() } : {}),
      ...(payload.externalUrl !== undefined
        ? { externalUrl: payload.externalUrl.trim() || undefined }
        : {}),
      ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl } : {}),
      ...(payload.videoUrl !== undefined ? { videoUrl: payload.videoUrl || undefined } : {}),
      ...(payload.mediaType !== undefined ? { mediaType: payload.mediaType } : {}),
      ...(typeof payload.width === "number" && payload.width > 0
        ? { width: Math.round(payload.width) }
        : {}),
      ...(typeof payload.height === "number" && payload.height > 0
        ? { height: Math.round(payload.height) }
        : {}),
      ...(typeof payload.canvasX === "number" ? { canvasX: Math.round(payload.canvasX) } : {}),
      ...(typeof payload.canvasY === "number" ? { canvasY: Math.round(payload.canvasY) } : {}),
    };
  } else {
    const prevOverride = store.overrides[payload.id] ?? {};
    store.overrides[payload.id] = {
      ...prevOverride,
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.year !== undefined ? { year: payload.year.trim() } : {}),
      ...(payload.externalUrl !== undefined
        ? { externalUrl: payload.externalUrl.trim() || undefined }
        : {}),
      ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl } : {}),
      ...(payload.videoUrl !== undefined ? { videoUrl: payload.videoUrl || undefined } : {}),
      ...(payload.mediaType !== undefined ? { mediaType: payload.mediaType } : {}),
      ...(typeof payload.width === "number" && payload.width > 0
        ? { width: Math.round(payload.width) }
        : {}),
      ...(typeof payload.height === "number" && payload.height > 0
        ? { height: Math.round(payload.height) }
        : {}),
      ...(typeof payload.canvasX === "number" ? { canvasX: Math.round(payload.canvasX) } : {}),
      ...(typeof payload.canvasY === "number" ? { canvasY: Math.round(payload.canvasY) } : {}),
    };
  }

  const saved = writeLocalCmsStore(store, payload.id);
  void pushStoreToServer(saved);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateAddMediaToCanvasItem(payload: {
  itemId: string;
  media: Array<{
    title?: string;
    mediaType: "image" | "video";
    url: string;
    width?: number;
    height?: number;
  }>;
}): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  const { items: currentItems } = buildResolvedCanvasItemsFromStore(store);
  const occupiedRects = getAllOccupiedRects(currentItems);

  const newExtras: CanvasExtraMediaItem[] = payload.media.map((m) => {
    const width =
      m.width && m.width > 0 ? Math.round(m.width) : m.mediaType === "video" ? 270 : 310;
    const height =
      m.height && m.height > 0 ? Math.round(m.height) : m.mediaType === "video" ? 380 : 310;
    const pos = findDistinctRandomCanvasPosition(occupiedRects, width, height, undefined, true);
    occupiedRects.push({
      canvasX: pos.canvasX,
      canvasY: pos.canvasY,
      width,
      height,
    });

    return {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: m.title,
      mediaType: m.mediaType,
      imageUrl: m.url,
      videoUrl: m.mediaType === "video" ? m.url : undefined,
      canvasX: pos.canvasX,
      canvasY: pos.canvasY,
      width,
      height,
    };
  });

  const addedIndex = store.addedItems.findIndex((item) => item.id === payload.itemId);
  if (addedIndex !== -1) {
    const current = store.addedItems[addedIndex];
    store.addedItems[addedIndex] = {
      ...current,
      extraMedia: [...(current.extraMedia ?? []), ...newExtras],
    };
  } else {
    const baseItem = PORTFOLIO_CANVAS_PROJECTS.find((p) => p.id === payload.itemId);
    const prevOverride = store.overrides[payload.itemId] ?? {};
    const existingExtra = prevOverride.extraMedia ?? baseItem?.extraMedia ?? [];
    store.overrides[payload.itemId] = {
      ...prevOverride,
      extraMedia: [...existingExtra, ...newExtras],
    };
  }

  store.lastFocusedId = payload.itemId;
  const saved = writeLocalCmsStore(store, payload.itemId);
  void pushStoreToServer(saved);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateDeleteMediaFromCanvasItem(payload: {
  itemId: string;
  mediaId: string;
}): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  pushUndoSnapshot(store);
  const addedIndex = store.addedItems.findIndex((item) => item.id === payload.itemId);

  if (addedIndex !== -1) {
    const current = store.addedItems[addedIndex];
    const extras = current.extraMedia ?? [];
    if (payload.mediaId === "primary") {
      if (extras.length > 0) {
        const [promoted, ...rest] = extras;
        store.addedItems[addedIndex] = {
          ...current,
          mediaType: promoted.mediaType,
          imageUrl: promoted.imageUrl,
          videoUrl: promoted.videoUrl,
          canvasX: promoted.canvasX,
          canvasY: promoted.canvasY,
          width: promoted.width,
          height: promoted.height,
          extraMedia: rest.length > 0 ? rest : undefined,
        };
      } else {
        store.addedItems.splice(addedIndex, 1);
        if (!store.deletedIds.includes(payload.itemId)) {
          store.deletedIds.push(payload.itemId);
        }
      }
    } else {
      const filtered = extras.filter((m) => m.id !== payload.mediaId);
      store.addedItems[addedIndex] = {
        ...current,
        extraMedia: filtered.length > 0 ? filtered : undefined,
      };
      if (!store.deletedIds.includes(payload.mediaId)) {
        store.deletedIds.push(payload.mediaId);
      }
    }
  } else {
    const baseItem = PORTFOLIO_CANVAS_PROJECTS.find((p) => p.id === payload.itemId);
    if (baseItem) {
      const prevOverride = store.overrides[payload.itemId] ?? {};
      const extras = prevOverride.extraMedia ?? baseItem.extraMedia ?? [];
      if (payload.mediaId === "primary") {
        if (extras.length > 0) {
          const [promoted, ...rest] = extras;
          store.overrides[payload.itemId] = {
            ...prevOverride,
            mediaType: promoted.mediaType,
            imageUrl: promoted.imageUrl,
            videoUrl: promoted.videoUrl,
            canvasX: promoted.canvasX,
            canvasY: promoted.canvasY,
            width: promoted.width,
            height: promoted.height,
            extraMedia: rest,
          };
        } else if (!store.deletedIds.includes(payload.itemId)) {
          store.deletedIds.push(payload.itemId);
        }
      } else {
        store.overrides[payload.itemId] = {
          ...prevOverride,
          extraMedia: extras.filter((m) => m.id !== payload.mediaId),
        };
        if (!store.deletedIds.includes(payload.mediaId)) {
          store.deletedIds.push(payload.mediaId);
        }
      }
    }
  }

  const saved = writeLocalCmsStore(store);
  void pushStoreToServer(saved);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateDeleteCanvasItem(id: string): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  pushUndoSnapshot(store);

  const addedIndex = store.addedItems.findIndex((item) => item.id === id);
  if (addedIndex !== -1) {
    store.addedItems.splice(addedIndex, 1);
  }

  for (let i = 0; i < store.addedItems.length; i += 1) {
    const extra = store.addedItems[i].extraMedia;
    if (extra && extra.some((m) => m.id === id)) {
      const filtered = extra.filter((m) => m.id !== id);
      store.addedItems[i] = {
        ...store.addedItems[i],
        extraMedia: filtered.length > 0 ? filtered : undefined,
      };
    }
  }

  for (const key of Object.keys(store.overrides)) {
    const ov = store.overrides[key];
    if (ov?.extraMedia && ov.extraMedia.some((m) => m.id === id)) {
      store.overrides[key] = {
        ...ov,
        extraMedia: ov.extraMedia.filter((m) => m.id !== id),
      };
    }
  }

  if (!store.deletedIds.includes(id)) {
    store.deletedIds.push(id);
  }
  delete store.overrides[id];
  if (store.lastFocusedId === id) {
    delete store.lastFocusedId;
  }

  const saved = writeLocalCmsStore(store);
  void pushStoreToServer(saved, true);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateRandomizeCanvasItemPosition(id: string): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  const { items: currentItems } = buildResolvedCanvasItemsFromStore(store);
  const otherRects = expandCanvasProjects(currentItems.filter((i) => i.id !== id)).map((p) => ({
    canvasX: p.canvasX,
    canvasY: p.canvasY,
    width: p.width,
    height: p.height,
  }));

  const target = currentItems.find((i) => i.id === id);
  if (!target) return buildResolvedCanvasItemsFromStore(store);

  const newPos = findDistinctRandomCanvasPosition(
    otherRects,
    target.width,
    target.height,
    { canvasX: target.canvasX, canvasY: target.canvasY },
    true,
  );
  otherRects.push({
    canvasX: newPos.canvasX,
    canvasY: newPos.canvasY,
    width: target.width,
    height: target.height,
  });

  const randomizedExtra = target.extraMedia?.map((extra) => {
    const ePos = findDistinctRandomCanvasPosition(
      otherRects,
      extra.width,
      extra.height,
      { canvasX: extra.canvasX, canvasY: extra.canvasY },
      true,
    );
    otherRects.push({
      canvasX: ePos.canvasX,
      canvasY: ePos.canvasY,
      width: extra.width,
      height: extra.height,
    });
    return {
      ...extra,
      canvasX: ePos.canvasX,
      canvasY: ePos.canvasY,
    };
  });

  const addedIndex = store.addedItems.findIndex((item) => item.id === id);
  if (addedIndex !== -1) {
    store.addedItems[addedIndex] = {
      ...store.addedItems[addedIndex],
      canvasX: newPos.canvasX,
      canvasY: newPos.canvasY,
      ...(randomizedExtra ? { extraMedia: randomizedExtra } : {}),
    };
  } else {
    store.overrides[id] = {
      ...(store.overrides[id] ?? {}),
      canvasX: newPos.canvasX,
      canvasY: newPos.canvasY,
      ...(randomizedExtra ? { extraMedia: randomizedExtra } : {}),
    };
  }

  store.lastFocusedId = id;
  settleStoreNonOverlappingPositions(store, [id]);
  const saved = writeLocalCmsStore(store, id);
  void pushStoreToServer(saved);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateShuffleAllCanvasItems(): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  const { items: currentItems } = buildResolvedCanvasItemsFromStore(store);
  const occupiedRects: CanvasRect[] = [];

  // Shuffle order so every shuffle creates an organic new studio constellation
  const shuffled = [...currentItems].sort(() => Math.random() - 0.5);

  for (const item of shuffled) {
    const pos = findDistinctRandomCanvasPosition(
      occupiedRects,
      item.width,
      item.height,
      { canvasX: item.canvasX, canvasY: item.canvasY },
      true,
    );
    occupiedRects.push({
      canvasX: pos.canvasX,
      canvasY: pos.canvasY,
      width: item.width,
      height: item.height,
    });

    const addedIndex = store.addedItems.findIndex((a) => a.id === item.id);
    if (addedIndex !== -1) {
      store.addedItems[addedIndex] = {
        ...store.addedItems[addedIndex],
        canvasX: pos.canvasX,
        canvasY: pos.canvasY,
      };
    } else {
      store.overrides[item.id] = {
        ...(store.overrides[item.id] ?? {}),
        canvasX: pos.canvasX,
        canvasY: pos.canvasY,
      };
    }
  }

  settleStoreNonOverlappingPositions(
    store,
    shuffled.map((i) => i.id),
  );
  const saved = writeLocalCmsStore(store);
  void pushStoreToServer(saved);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateFocusCanvasItem(id: string): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  store.lastFocusedId = id;
  const saved = writeLocalCmsStore(store, id);
  void pushStoreToServer(saved);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateClearAllCanvasItems(): ResolvedCanvasCmsState {
  const store = readLocalCmsStore();
  pushUndoSnapshot(store);
  const deletedSet = new Set(store.deletedIds);
  for (const item of store.addedItems) {
    deletedSet.add(item.id);
    if (item.extraMedia) {
      for (const extra of item.extraMedia) {
        deletedSet.add(extra.id);
      }
    }
  }
  store.addedItems = [];
  store.overrides = {};
  store.deletedIds = Array.from(deletedSet);
  delete store.lastFocusedId;
  const saved = writeLocalCmsStore(store);
  void pushStoreToServer(saved, true);
  return buildResolvedCanvasItemsFromStore(saved);
}

export function mutateUndoLastCmsAction(): ResolvedCanvasCmsState | null {
  const previous = undoHistoryStack.pop();
  if (!previous) return null;
  const saved = writeLocalCmsStore(previous);
  void pushStoreToServer(saved, true);
  return buildResolvedCanvasItemsFromStore(saved);
}

export async function recoverAccidentalDeletionIfNeeded(): Promise<ResolvedCanvasCmsState | null> {
  return null;
}
