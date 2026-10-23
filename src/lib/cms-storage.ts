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

const LOCAL_STORAGE_KEY = "grvnth_canvas_cms_store_v6";
const CLOUD_UPLOADED_KEYS_STORAGE_KEY = "grvnth_cms_uploaded_cloud_keys_v1";
const BROADCAST_CHANNEL_NAME = "grvnth_canvas_cms_channel";
const IDB_NAME = "grvnth_cms_media_idb";
const IDB_STORE = "media_files";
const IDB_STORE_BACKUP_KEY = "__cms_store_v6__";
const CMS_SNAPSHOT_PREFIX = "cms-canvas-store-v6-";
const SUPABASE_FALLBACK_URL = "https://jnolhqtsuyfckytngssa.supabase.co";
const SUPABASE_FALLBACK_KEY = "sb_publishable_UtllKtAciWXasnSJ1VY35g_P5tiVA9W";
const SUPABASE_BUCKET = "contact-attachments";
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

let memoryStore: CanvasCmsStoreData | null = null;
const undoHistoryStack: CanvasCmsStoreData[] = [];
let mutationVersion = 0;
let pendingPushPromise: Promise<void> | null = null;
let isBackgroundHealingRunning = false;
const objectUrlCache = new Map<string, string>();
const cloudSignedUrlCache = new Map<string, string>();
const cloudUploadedKeys = new Set<string>();
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== "undefined") {
  try {
    const rawKeys = window.localStorage.getItem(CLOUD_UPLOADED_KEYS_STORAGE_KEY);
    if (rawKeys) {
      const parsed = JSON.parse(rawKeys) as unknown;
      if (Array.isArray(parsed)) {
        for (const k of parsed) {
          if (typeof k === "string" && k) cloudUploadedKeys.add(k);
        }
      }
    }
  } catch {
    // Ignore storage error
  }
}

function markKeyCloudUploaded(key: string, signedUrl?: string): void {
  if (!key) return;
  cloudUploadedKeys.add(key);
  if (signedUrl) {
    cloudSignedUrlCache.set(key, signedUrl);
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        CLOUD_UPLOADED_KEYS_STORAGE_KEY,
        JSON.stringify(Array.from(cloudUploadedKeys)),
      );
    } catch {
      // Ignore quota error
    }
  }
}

function getSupabaseRestConfig(): { url: string; key: string } {
  const metaEnv = (
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}
  ) as Record<string, string | undefined>;
  const url = (metaEnv["VITE_SUPABASE_URL"] || SUPABASE_FALLBACK_URL).replace(/\/+$/, "");
  const key = metaEnv["VITE_SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_FALLBACK_KEY;
  return { url, key };
}

async function uploadBlobToSupabaseRest(
  storagePath: string,
  blob: Blob,
  contentType: string,
): Promise<boolean> {
  const { url, key } = getSupabaseRestConfig();
  try {
    const res = await fetch(`${url}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": contentType || "application/octet-stream",
        "x-upsert": "false",
      },
      body: blob,
    });
    if (res.ok) return true;
    const errText = await res.text().catch(() => "");
    if (
      errText.toLowerCase().includes("already exists") ||
      errText.toLowerCase().includes("duplicate")
    ) {
      return true;
    }
  } catch {
    // Ignore network error
  }
  return false;
}

async function createSupabaseSignedUrlRest(
  storagePath: string,
  expiresIn = TEN_YEARS_SECONDS,
): Promise<string | null> {
  const { url, key } = getSupabaseRestConfig();
  try {
    const res = await fetch(`${url}/storage/v1/object/sign/${SUPABASE_BUCKET}/${storagePath}`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { signedURL?: string } | null;
    if (data?.signedURL) {
      return `${url}/storage/v1${data.signedURL}`;
    }
  } catch {
    // Ignore sign error
  }
  return null;
}

function extractSnapshotTimestamp(name: string): number {
  const match = name.match(/cms-canvas-store-v\d+-0*(\d+)/);
  if (match?.[1]) {
    const parsed = parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

async function listSupabaseSnapshotsRest(
  prefixSearch: string,
  limit = 16,
): Promise<Array<{ name: string }>> {
  const { url, key } = getSupabaseRestConfig();
  try {
    const res = await fetch(`${url}/storage/v1/object/list/${SUPABASE_BUCKET}`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
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

async function downloadSupabaseObjectTextRest(storagePath: string): Promise<string | null> {
  const { url, key } = getSupabaseRestConfig();
  try {
    const res = await fetch(`${url}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`, {
      method: "GET",
      headers: {
        apikey: key,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

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
  const addedItems = Array.isArray(raw.addedItems) ? [...raw.addedItems] : [];
  const rawDeletedIds = Array.isArray(raw.deletedIds) ? [...raw.deletedIds] : [];
  const addedIdSet = new Set(addedItems.map((item) => item.id));
  const deletedIds = rawDeletedIds.filter((id) => !addedIdSet.has(id));
  return {
    addedItems,
    deletedIds,
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
  if (new Date(store.updatedAt || 0).getTime() > 0) {
    void openMediaIdb().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(serialized, IDB_STORE_BACKUP_KEY);
      } catch {
        // Ignore IDB write error
      }
    });
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
    // When the canvas is empty or has only a few items, keep items tightly clustered around
    // initialFocusX/Y so the viewport is never blank when opening the site.
    if (existingRects.length === 0 && !previousPos) {
      const firstX = Math.round(
        CANVAS_DIMENSIONS.initialFocusX - width / 2 + (Math.random() - 0.5) * 140,
      );
      const firstY = Math.round(
        CANVAS_DIMENSIONS.initialFocusY - height / 2 + (Math.random() - 0.5) * 90,
      );
      return {
        canvasX: Math.max(140, Math.min(CANVAS_DIMENSIONS.width - width - 140, firstX)),
        canvasY: Math.max(140, Math.min(CANVAS_DIMENSIONS.height - height - 140, firstY)),
      };
    }

    const tiers = [
      { rx: 420, ry: 270, attempts: 140 },
      { rx: 680, ry: 440, attempts: 160 },
      { rx: 980, ry: 650, attempts: 180 },
    ];

    for (const tier of tiers) {
      const centerMinX = Math.max(140, CANVAS_DIMENSIONS.initialFocusX - width / 2 - tier.rx);
      const centerMaxX = Math.min(
        CANVAS_DIMENSIONS.width - width - 140,
        CANVAS_DIMENSIONS.initialFocusX - width / 2 + tier.rx,
      );
      const centerMinY = Math.max(140, CANVAS_DIMENSIONS.initialFocusY - height / 2 - tier.ry);
      const centerMaxY = Math.min(
        CANVAS_DIMENSIONS.height - height - 140,
        CANVAS_DIMENSIONS.initialFocusY - height / 2 + tier.ry,
      );

      for (let attempt = 0; attempt < tier.attempts; attempt += 1) {
        const candidateX = Math.round(centerMinX + Math.random() * (centerMaxX - centerMinX));
        const candidateY = Math.round(centerMinY + Math.random() * (centerMaxY - centerMinY));
        if (previousPos) {
          const dist = Math.hypot(
            candidateX - previousPos.canvasX,
            candidateY - previousPos.canvasY,
          );
          if (dist < minDistanceFromPrevious) continue;
        }
        if (!doesRectOverlapAny(candidateX, candidateY, width, height, existingRects, minGap)) {
          return { canvasX: candidateX, canvasY: candidateY };
        }
      }
    }

    // Fallback inside central neighborhood so caller can nudge adjacent cards without exiling the item
    const fallbackMinX = Math.max(140, CANVAS_DIMENSIONS.initialFocusX - width / 2 - 520);
    const fallbackMaxX = Math.min(
      CANVAS_DIMENSIONS.width - width - 140,
      CANVAS_DIMENSIONS.initialFocusX - width / 2 + 520,
    );
    const fallbackMinY = Math.max(140, CANVAS_DIMENSIONS.initialFocusY - height / 2 - 360);
    const fallbackMaxY = Math.min(
      CANVAS_DIMENSIONS.height - height - 140,
      CANVAS_DIMENSIONS.initialFocusY - height / 2 + 360,
    );
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const candidateX = Math.round(fallbackMinX + Math.random() * (fallbackMaxX - fallbackMinX));
      const candidateY = Math.round(fallbackMinY + Math.random() * (fallbackMaxY - fallbackMinY));
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
export function settleStoreNonOverlappingPositions(
  store: CanvasCmsStoreData,
  priorityIds: string[] = [],
): void {
  if (priorityIds.length === 0) return;
  const { items } = buildResolvedCanvasItemsFromStore(store);
  const prioritySet = new Set(priorityIds);
  // Keep all existing items locked in place first; only adjust the newly added/moved priorityIds if needed
  const lockedExisting = [
    ...items.filter((item) => !prioritySet.has(item.id)),
    ...items.filter((item) => prioritySet.has(item.id)),
  ];

  const settled = resolveNonOverlappingProjects(lockedExisting, undefined, 68);
  const settledMap = new Map(settled.map((item) => [item.id, item]));

  for (let i = 0; i < store.addedItems.length; i += 1) {
    const id = store.addedItems[i].id;
    if (!prioritySet.has(id)) continue;
    const updated = settledMap.get(id);
    if (updated) {
      store.addedItems[i] = {
        ...store.addedItems[i],
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

  const itemsToReturn =
    resolvedAdded.length > 0
      ? resolvedAdded
      : PORTFOLIO_CANVAS_PROJECTS.filter((p) => !deletedSet.has(p.id));

  return {
    items: itemsToReturn,
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

async function readIdbStoreBackup(): Promise<CanvasCmsStoreData | null> {
  const db = await openMediaIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_STORE_BACKUP_KEY);
      req.onsuccess = () => {
        if (typeof req.result === "string" && req.result.length > 2) {
          try {
            const parsed = normalizeStore(JSON.parse(req.result) as Partial<CanvasCmsStoreData>);
            if (new Date(parsed.updatedAt || 0).getTime() > 0) {
              resolve(parsed);
              return;
            }
          } catch {
            // Ignore parse error
          }
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function uploadMediaBlobToSupabaseCloud(key: string, blob: Blob): Promise<string | null> {
  if (!key || blob.size === 0 || blob.size > 50 * 1024 * 1024) return null;
  const cachedSigned = cloudSignedUrlCache.get(key);
  if (cachedSigned && cloudUploadedKeys.has(key)) {
    return cachedSigned;
  }
  try {
    const storagePath = `inquiries/${key}`;
    if (!cloudUploadedKeys.has(key)) {
      const uploaded = await uploadBlobToSupabaseRest(
        storagePath,
        blob,
        blob.type || "application/octet-stream",
      );
      if (uploaded) {
        markKeyCloudUploaded(key);
      }
    }
    const signedUrl = await createSupabaseSignedUrlRest(storagePath, TEN_YEARS_SECONDS);
    if (signedUrl) {
      markKeyCloudUploaded(key, signedUrl);
      return signedUrl;
    }
  } catch {
    // Ignore cloud upload error
  }
  return null;
}

export async function getCloudSignedUrlForMediaKey(
  key: string,
  forceRefresh = false,
): Promise<string | null> {
  if (!key) return null;
  if (!forceRefresh) {
    const cachedSigned = cloudSignedUrlCache.get(key);
    if (cachedSigned) return cachedSigned;
  } else {
    cloudSignedUrlCache.delete(key);
  }
  try {
    const signedUrl = await createSupabaseSignedUrlRest(`inquiries/${key}`, TEN_YEARS_SECONDS);
    if (signedUrl) {
      markKeyCloudUploaded(key, signedUrl);
      return signedUrl;
    }
  } catch {
    // Ignore cloud lookup error
  }
  return null;
}

export async function getMediaObjectUrlFromIdb(
  key: string,
  forceRefresh = false,
): Promise<string | null> {
  if (!forceRefresh) {
    const cached = objectUrlCache.get(key);
    if (cached) return cached;
  } else {
    objectUrlCache.delete(key);
  }

  const found = await getMediaBlobFromIdb(key);
  if (found) {
    const existingMatchedUrl = !forceRefresh ? objectUrlCache.get(found.matchedKey) : null;
    const url = existingMatchedUrl ?? URL.createObjectURL(found.blob);
    objectUrlCache.set(key, url);
    objectUrlCache.set(found.matchedKey, url);
    return url;
  }

  // Fallback for visitors or new browser sessions: resolve 10-year signed URL directly from Supabase Storage
  const cloudSignedUrl = await getCloudSignedUrlForMediaKey(key, forceRefresh);
  if (cloudSignedUrl) {
    objectUrlCache.set(key, cloudSignedUrl);
    return cloudSignedUrl;
  }

  return null;
}

export function extractMediaKeyFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    if (url.includes("local=")) {
      const parsed = new URL(url, "http://localhost");
      return parsed.searchParams.get("local");
    }
    if (url.includes("inquiry=")) {
      const parsed = new URL(url, "http://localhost");
      return parsed.searchParams.get("inquiry");
    }
    const cloudMatch = url.match(/\/contact-attachments\/(?:inquiries|cms)\/([^?#&/]+)/i);
    if (cloudMatch?.[1]) {
      return decodeURIComponent(cloudMatch[1]);
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

function registerStoreKnownCloudUrls(store: CanvasCmsStoreData): void {
  for (const item of store.addedItems) {
    for (const candidateUrl of [item.imageUrl, item.videoUrl]) {
      if (candidateUrl && candidateUrl.startsWith("https://")) {
        const key = extractMediaKeyFromUrl(candidateUrl);
        if (key && key.startsWith("cms-")) {
          markKeyCloudUploaded(key, candidateUrl);
        }
      }
    }
    if (item.extraMedia) {
      for (const extra of item.extraMedia) {
        for (const candidateUrl of [extra.imageUrl, extra.videoUrl]) {
          if (candidateUrl && candidateUrl.startsWith("https://")) {
            const key = extractMediaKeyFromUrl(candidateUrl);
            if (key && key.startsWith("cms-")) {
              markKeyCloudUploaded(key, candidateUrl);
            }
          }
        }
      }
    }
  }
}

async function resolveBestDurableMediaUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    const existingKey = extractMediaKeyFromUrl(trimmed);
    if (existingKey && existingKey.startsWith("cms-")) {
      markKeyCloudUploaded(existingKey, trimmed);
    }
    return trimmed;
  }

  const key = extractMediaKeyFromUrl(trimmed);
  if (!key || !key.startsWith("cms-")) {
    return trimmed;
  }

  // 1. Check Supabase Cloud signed URL first (fast JSON POST) before uploading multi-MB blobs
  const existingCloudSigned = await getCloudSignedUrlForMediaKey(key);
  if (existingCloudSigned) {
    return existingCloudSigned;
  }

  // 2. Check IndexedDB
  const idbFound = await getMediaBlobFromIdb(key);
  if (idbFound) {
    if (!objectUrlCache.has(key)) {
      const objUrl = URL.createObjectURL(idbFound.blob);
      objectUrlCache.set(key, objUrl);
      objectUrlCache.set(idbFound.matchedKey, objUrl);
    }

    const cloudSigned = await uploadMediaBlobToSupabaseCloud(key, idbFound.blob);
    if (cloudSigned) {
      return cloudSigned;
    }
    return trimmed;
  }

  // 3. Check if server has the file and hydrate IndexedDB + Cloud
  try {
    const checkRes = await fetch(`/api/drive-media?local=${encodeURIComponent(key)}&check=1`, {
      cache: "no-store",
    });
    if (checkRes.ok) {
      const data = (await checkRes.json()) as { exists?: boolean };
      if (data.exists) {
        const mediaRes = await fetch(`/api/drive-media?local=${encodeURIComponent(key)}`);
        if (mediaRes.ok) {
          const blob = await mediaRes.blob();
          if (blob.size > 0) {
            await saveMediaBlobToIdb(key, blob);
            const uploadedSigned = await uploadMediaBlobToSupabaseCloud(key, blob);
            if (uploadedSigned) return uploadedSigned;
          }
        }
        return trimmed;
      }
    }
  } catch {
    // Ignore network error
  }

  return trimmed;
}

/**
 * Surgically upgrades local=/api/drive-media URLs in-place to 10-year https:// signed URLs
 * WITHOUT modifying updatedAt, deletedIds, item membership, or coordinates, so background
 * media healing can NEVER overwrite or revert any user CMS edit.
 */
function applyUpgradedMediaUrlsToStore(urlMap: Record<string, string>): void {
  const keys = Object.keys(urlMap);
  if (keys.length === 0) return;

  const store = readLocalCmsStore();
  let modified = false;

  for (let i = 0; i < store.addedItems.length; i += 1) {
    const item = store.addedItems[i];
    const primaryKey = extractMediaKeyFromUrl(item.videoUrl || item.imageUrl);
    if (primaryKey && urlMap[primaryKey]) {
      const upgraded = urlMap[primaryKey];
      if (item.imageUrl !== upgraded || (item.videoUrl && item.videoUrl !== upgraded)) {
        store.addedItems[i] = {
          ...item,
          imageUrl: upgraded,
          ...(item.mediaType === "video" || item.videoUrl ? { videoUrl: upgraded } : {}),
        };
        modified = true;
      }
    }

    if (store.addedItems[i].extraMedia && store.addedItems[i].extraMedia!.length > 0) {
      const updatedExtras = [...store.addedItems[i].extraMedia!];
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
              ...(extra.mediaType === "video" || extra.videoUrl ? { videoUrl: upgradedExtra } : {}),
            };
            extrasChanged = true;
            modified = true;
          }
        }
      }
      if (extrasChanged) {
        store.addedItems[i] = {
          ...store.addedItems[i],
          extraMedia: updatedExtras,
        };
      }
    }
  }

  if (!modified) return;

  persistStoreLocally(store);
  const resolved = buildResolvedCanvasItemsFromStore(store);
  broadcastCanvasCmsUpdate(resolved.items);

  void fetch(`/api/drive-media?cmsState=1&_t=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "upgradeMediaUrls",
      urlMap,
    }),
  }).catch(() => {});
}

function scheduleBackgroundMediaHealing(store: CanvasCmsStoreData): void {
  if (typeof window === "undefined" || isBackgroundHealingRunning) return;

  const keysToHeal: Array<{ key: string; url: string }> = [];
  const seenKeys = new Set<string>();

  for (const item of store.addedItems) {
    const primaryUrl = item.videoUrl || item.imageUrl;
    if (primaryUrl && primaryUrl.includes("local=")) {
      const key = extractMediaKeyFromUrl(primaryUrl);
      if (key && key.startsWith("cms-") && !seenKeys.has(key)) {
        seenKeys.add(key);
        keysToHeal.push({ key, url: primaryUrl });
      }
    }
    if (item.extraMedia) {
      for (const extra of item.extraMedia) {
        const extraUrl = extra.videoUrl || extra.imageUrl;
        if (extraUrl && extraUrl.includes("local=")) {
          const key = extractMediaKeyFromUrl(extraUrl);
          if (key && key.startsWith("cms-") && !seenKeys.has(key)) {
            seenKeys.add(key);
            keysToHeal.push({ key, url: extraUrl });
          }
        }
      }
    }
  }

  if (keysToHeal.length === 0) return;

  isBackgroundHealingRunning = true;
  void (async () => {
    try {
      for (const entry of keysToHeal) {
        const upgraded = await resolveBestDurableMediaUrl(entry.url);
        if (upgraded && upgraded.startsWith("https://")) {
          applyUpgradedMediaUrlsToStore({ [entry.key]: upgraded });
        }
      }
    } finally {
      isBackgroundHealingRunning = false;
    }
  })();
}

/**
 * If all stores are uninitialized (epoch 0, 0 items, 0 deletedIds) — e.g. after a wiped snapshot —
 * automatically checks IndexedDB for any previously uploaded `cms-...` blobs and reconstructs them
 * onto the canvas so the user never has to re-upload existing work.
 */
async function recoverOrphanedIdbMediaIfStoreEmpty(
  store: CanvasCmsStoreData,
): Promise<{ store: CanvasCmsStoreData; recovered: boolean }> {
  const storeTime = new Date(store.updatedAt || 0).getTime();
  if (storeTime > 0 || store.addedItems.length > 0 || store.deletedIds.length > 0) {
    return { store, recovered: false };
  }

  const db = await openMediaIdb();
  if (!db) return { store, recovered: false };

  const cmsEntries = await new Promise<Array<{ key: string; blob: Blob }>>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const objStore = tx.objectStore(IDB_STORE);
      const keysReq = objStore.getAllKeys();
      keysReq.onsuccess = () => {
        const allKeys = (keysReq.result ?? [])
          .map((k) => String(k))
          .filter((k) => k.startsWith("cms-"));
        if (allKeys.length === 0) {
          resolve([]);
          return;
        }
        const collected: Array<{ key: string; blob: Blob }> = [];
        let remaining = allKeys.length;
        for (const k of allKeys) {
          const getReq = objStore.get(k);
          getReq.onsuccess = () => {
            if (getReq.result instanceof Blob && getReq.result.size > 0) {
              collected.push({ key: k, blob: getReq.result });
            }
            remaining -= 1;
            if (remaining === 0) resolve(collected);
          };
          getReq.onerror = () => {
            remaining -= 1;
            if (remaining === 0) resolve(collected);
          };
        }
      };
      keysReq.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

  if (cmsEntries.length === 0) {
    return { store, recovered: false };
  }

  // Deduplicate by filename suffix so we don't create duplicate items for the same file
  const uniqueBySuffix = new Map<string, { key: string; blob: Blob }>();
  for (const entry of cmsEntries) {
    const suffix = getCmsKeySuffix(entry.key) || entry.key;
    uniqueBySuffix.set(suffix, entry);
  }

  const nextStore = cloneStore(store);
  const occupiedRects: CanvasRect[] = [];

  for (const { key, blob } of uniqueBySuffix.values()) {
    const objUrl = URL.createObjectURL(blob);
    objectUrlCache.set(key, objUrl);

    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const isVideo =
      blob.type.startsWith("video/") ||
      ["mp4", "webm", "mov", "m4v", "mkv", "avi", "ogg", "ogv"].includes(ext);
    const width = isVideo ? 270 : 310;
    const height = isVideo ? 380 : 310;
    const pos = findDistinctRandomCanvasPosition(occupiedRects, width, height, undefined, true);
    occupiedRects.push({ canvasX: pos.canvasX, canvasY: pos.canvasY, width, height });

    const finalUrl =
      cloudSignedUrlCache.get(key) || `/api/drive-media?local=${encodeURIComponent(key)}`;
    const rawSlug = getCmsKeySuffix(key).replace(/\.[^.]+$/, "");
    const title =
      rawSlug.replace(/[-_]+/g, " ").trim() || (isVideo ? "Studio Video" : "Studio Artwork");

    nextStore.addedItems.push({
      id: `item-${key}`,
      title,
      description: "",
      year: new Date().getFullYear().toString(),
      mediaType: isVideo ? "video" : "image",
      imageUrl: finalUrl,
      videoUrl: isVideo ? finalUrl : undefined,
      canvasX: pos.canvasX,
      canvasY: pos.canvasY,
      width,
      height,
    });
  }

  nextStore.updatedAt = new Date().toISOString();
  settleStoreNonOverlappingPositions(nextStore);
  return { store: nextStore, recovered: true };
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
 * Uploads one or more image/video files to IndexedDB + /api/drive-media + Supabase Cloud.
 * Immediately caches the blob in IndexedDB + objectUrlCache so the CMS & Portfolio render
 * in 0ms, and bounds blocking upload wait to 3.5s per file (continuing in background if larger).
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

    // 2. Start server upload + Supabase Cloud upload in background
    void fetch(
      `/api/drive-media?filename=${encodeURIComponent(file.name)}&localKey=${encodeURIComponent(localKey)}`,
      {
        method: "POST",
        headers: {
          "x-file-name": encodeURIComponent(file.name),
          "x-file-type": file.type || "application/octet-stream",
        },
        body: file,
      },
    ).catch(() => {});

    const cloudUploadPromise = uploadMediaBlobToSupabaseCloud(localKey, file).then((signedUrl) => {
      if (signedUrl) {
        applyUpgradedMediaUrlsToStore({ [localKey]: signedUrl });
      }
      return signedUrl;
    });

    // Wait up to 3.5s for the cloud URL; if larger/slower, return immediately with localKey (already in objectUrlCache)
    // and let cloudUploadPromise upgrade the URL in-place when finished.
    const cloudSignedUrl = await Promise.race([
      cloudUploadPromise.catch(() => null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3500)),
    ]);

    const finalUrl = cloudSignedUrl || `/api/drive-media?local=${encodeURIComponent(localKey)}`;

    results.push({
      url: finalUrl,
      mediaType: isVideo ? "video" : "image",
      title: cleanTitle,
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

  // An initialized store (updatedAt > 0) always wins over an uninitialized epoch store (updatedAt <= 0)
  if (pTime > 0 && sTime <= 0) {
    return cloneStore(primary);
  }
  if (sTime > 0 && pTime <= 0) {
    return cloneStore(secondary);
  }
  if (pTime <= 0 && sTime <= 0) {
    return createEmptyStore();
  }

  const newer = pTime >= sTime ? primary : secondary;
  const older = pTime >= sTime ? secondary : primary;
  const newerTime = Math.max(pTime, sTime);
  const olderTime = Math.min(pTime, sTime);

  // Build a lookup of any already-upgraded https:// URLs in the older store by media key
  const olderCloudUrlByKey = new Map<string, string>();
  for (const oldItem of older.addedItems) {
    const oldUrl = oldItem.videoUrl || oldItem.imageUrl;
    if (oldUrl && oldUrl.startsWith("https://")) {
      const k = extractMediaKeyFromUrl(oldUrl);
      if (k) olderCloudUrlByKey.set(k, oldUrl);
    }
  }

  const upgradeItemUrlIfAvailable = (item: PortfolioCanvasProject): PortfolioCanvasProject => {
    const curUrl = item.videoUrl || item.imageUrl;
    if (curUrl && curUrl.includes("local=")) {
      const k = extractMediaKeyFromUrl(curUrl);
      const upgraded = k ? (cloudSignedUrlCache.get(k) ?? olderCloudUrlByKey.get(k)) : undefined;
      if (upgraded) {
        return {
          ...item,
          imageUrl: upgraded,
          ...(item.mediaType === "video" || item.videoUrl ? { videoUrl: upgraded } : {}),
        };
      }
    }
    return item;
  };

  // When one store has a strictly newer timestamp, its addedItems list, deletedIds, overrides,
  // and item coordinates are 100% authoritative so Upload, Delete, Clear All, Undo, Random Pos,
  // and Shuffle All are NEVER reverted or polluted by stale items.
  if (newerTime > olderTime) {
    const deletedSet = new Set<string>(newer.deletedIds);
    const mergedAddedItems: PortfolioCanvasProject[] = [];
    const seenIds = new Set<string>();

    for (const item of newer.addedItems) {
      if (!deletedSet.has(item.id) && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        mergedAddedItems.push(upgradeItemUrlIfAvailable(item));
      }
    }

    for (const item of older.addedItems) {
      if (!deletedSet.has(item.id) && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        mergedAddedItems.push(upgradeItemUrlIfAvailable(item));
      }
    }

    const mergedOverrides: Record<string, Partial<PortfolioCanvasProject>> = {
      ...older.overrides,
      ...newer.overrides,
    };
    for (const delId of deletedSet) {
      delete mergedOverrides[delId];
    }

    const cleanDeletedIds = Array.from(deletedSet).filter((id) => !seenIds.has(id));

    return {
      addedItems: mergedAddedItems,
      deletedIds: cleanDeletedIds,
      overrides: mergedOverrides,
      updatedAt: new Date(newerTime).toISOString(),
      ...(newer.lastFocusedId && !deletedSet.has(newer.lastFocusedId)
        ? { lastFocusedId: newer.lastFocusedId }
        : older.lastFocusedId && !deletedSet.has(older.lastFocusedId)
          ? { lastFocusedId: older.lastFocusedId }
          : {}),
    };
  }

  // Exact same timestamp: union non-deleted items and carry over any https:// URL upgrades
  const deletedSet = new Set<string>([...newer.deletedIds, ...older.deletedIds]);
  const mergedAddedItems: PortfolioCanvasProject[] = [];
  const seenIds = new Set<string>();

  for (const item of [...newer.addedItems, ...older.addedItems]) {
    if (!deletedSet.has(item.id) && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      mergedAddedItems.push(upgradeItemUrlIfAvailable(item));
    }
  }

  const mergedOverrides: Record<string, Partial<PortfolioCanvasProject>> = {
    ...older.overrides,
    ...newer.overrides,
  };
  for (const delId of deletedSet) {
    delete mergedOverrides[delId];
  }

  const cleanDeletedIds = Array.from(deletedSet).filter((id) => !seenIds.has(id));

  return {
    addedItems: mergedAddedItems,
    deletedIds: cleanDeletedIds,
    overrides: mergedOverrides,
    updatedAt: new Date(newerTime).toISOString(),
    ...(newer.lastFocusedId && !deletedSet.has(newer.lastFocusedId)
      ? { lastFocusedId: newer.lastFocusedId }
      : older.lastFocusedId && !deletedSet.has(older.lastFocusedId)
        ? { lastFocusedId: older.lastFocusedId }
        : {}),
  };
}

async function readCloudCmsStoreSnapshot(): Promise<CanvasCmsStoreData | null> {
  try {
    const v6Files = await listSupabaseSnapshotsRest(CMS_SNAPSHOT_PREFIX, 16);
    for (const file of v6Files) {
      const text = await downloadSupabaseObjectTextRest(`inquiries/${file.name}`);
      if (!text) continue;
      try {
        const parsed = normalizeStore(JSON.parse(text) as Partial<CanvasCmsStoreData>);
        if (new Date(parsed.updatedAt || 0).getTime() > 0) {
          return parsed;
        }
      } catch {
        // Try next snapshot
      }
    }
  } catch {
    // Ignore cloud read error
  }
  return null;
}

async function writeCloudCmsStoreSnapshot(store: CanvasCmsStoreData): Promise<void> {
  try {
    const storeTime = new Date(store.updatedAt || 0).getTime();
    // Never upload an uninitialized epoch-0 store to cloud snapshots
    if (storeTime <= 0) return;

    const ts = Math.max(Date.now(), storeTime);
    const paddedTs = String(ts).padStart(15, "0");
    const rand = Math.random().toString(36).slice(2, 7);
    const snapName = `${CMS_SNAPSHOT_PREFIX}${paddedTs}-${rand}.json`;
    const blob = new Blob([JSON.stringify(store)], { type: "application/json" });

    await uploadBlobToSupabaseRest(`inquiries/${snapName}`, blob, "application/json");
  } catch {
    // Ignore cloud snapshot error
  }
}

export function pushStoreToServer(store: CanvasCmsStoreData, forceReplace = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const snapshot = cloneStore(store);

  const runPush = async () => {
    await Promise.allSettled([
      writeCloudCmsStoreSnapshot(snapshot),
      (async () => {
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
            const data = (await res.json().catch(() => null)) as ResolvedCanvasCmsState | null;
            if (data?.store) {
              persistStoreLocally(data.store);
            }
            window.dispatchEvent(
              new CustomEvent("canvas-cms-server-synced", {
                detail: data ?? buildResolvedCanvasItemsFromStore(snapshot),
              }),
            );
          }
        } catch {
          // Cloud + local store already hold the state
        }
      })(),
    ]);
  };

  pendingPushPromise = (pendingPushPromise ?? Promise.resolve()).then(runPush, runPush);
  return pendingPushPromise;
}

export async function flushPendingCmsPush(): Promise<void> {
  if (pendingPushPromise) {
    await Promise.race([
      pendingPushPromise.catch(() => {}),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
    ]);
  }
}

async function fetchServerCmsStoreWithTimeout(
  timeoutMs = 3500,
): Promise<CanvasCmsStoreData | null> {
  if (typeof window === "undefined") return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/drive-media?cmsState=1&_t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { store?: Partial<CanvasCmsStoreData> };
    return data?.store ? normalizeStore(data.store) : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function loadSynchronizedCmsState(): Promise<ResolvedCanvasCmsState> {
  if (pendingPushPromise) {
    await Promise.race([
      pendingPushPromise.catch(() => {}),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
    ]);
  }

  const versionBeforeFetch = mutationVersion;

  const serverStore = await fetchServerCmsStoreWithTimeout(3500);

  if (mutationVersion !== versionBeforeFetch) {
    const current = readLocalCmsStore();
    registerStoreKnownCloudUrls(current);
    return buildResolvedCanvasItemsFromStore(current);
  }

  const localStore = readLocalCmsStore();
  const localTime = new Date(localStore.updatedAt || 0).getTime();
  const serverTime = new Date(serverStore?.updatedAt || 0).getTime();

  let chosenStore: CanvasCmsStoreData;

  const hasServerItems = Boolean(
    serverStore &&
    (serverStore.addedItems.length > 0 || serverStore.deletedIds.length > 0 || serverTime > 0),
  );
  const hasLocalItems = Boolean(
    localStore &&
    (localStore.addedItems.length > 0 || localStore.deletedIds.length > 0 || localTime > 0),
  );

  if (hasServerItems && hasLocalItems && serverStore) {
    if (serverTime >= localTime) {
      chosenStore = mergeCmsStores(localStore, serverStore);
    } else {
      chosenStore = mergeCmsStores(serverStore, localStore);
      void pushStoreToServer(chosenStore, true);
    }
    persistStoreLocally(chosenStore);
  } else if (hasServerItems && serverStore) {
    chosenStore = serverStore;
    persistStoreLocally(chosenStore);
  } else if (hasLocalItems) {
    chosenStore = localStore;
    if (serverStore !== null) {
      void pushStoreToServer(chosenStore, true);
    }
  } else {
    // Cold start fallback when server and local are both empty
    const cloudStore = await readCloudCmsStoreSnapshot();
    if (cloudStore && (cloudStore.addedItems.length > 0 || cloudStore.deletedIds.length > 0)) {
      chosenStore = cloudStore;
      persistStoreLocally(chosenStore);
      void pushStoreToServer(chosenStore, true);
    } else {
      const idbBackupStore = await readIdbStoreBackup();
      const idbTime = new Date(idbBackupStore?.updatedAt || 0).getTime();
      if (
        idbBackupStore &&
        (idbBackupStore.addedItems.length > 0 ||
          idbBackupStore.deletedIds.length > 0 ||
          idbTime > 0)
      ) {
        chosenStore = idbBackupStore;
        persistStoreLocally(chosenStore);
        void pushStoreToServer(chosenStore, true);
      } else {
        const recovery = await recoverOrphanedIdbMediaIfStoreEmpty(localStore);
        chosenStore = recovery.store;
        if (recovery.recovered) {
          persistStoreLocally(chosenStore);
          void pushStoreToServer(chosenStore, true);
        }
      }
    }
  }

  if (mutationVersion !== versionBeforeFetch) {
    const current = readLocalCmsStore();
    registerStoreKnownCloudUrls(current);
    return buildResolvedCanvasItemsFromStore(current);
  }

  registerStoreKnownCloudUrls(chosenStore);
  scheduleBackgroundMediaHealing(chosenStore);

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
