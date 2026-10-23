import fs from "node:fs";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import {
  expandCanvasProjects,
  findRandomCanvasPosition,
  PORTFOLIO_CANVAS_PROJECTS,
  type CanvasExtraMediaItem,
  type CanvasRect,
  type PortfolioCanvasProject,
  type PortfolioCanvasProjectInput,
} from "@/data/portfolioProjects";
import { getCmsData, getPublicPortfolioData } from "./drive-cms/store";
import { syncGoogleDriveRoot } from "./drive-cms/drive-client";

const BUILTIN_PUBLIC_MEDIA_FILES = new Set([
  "demo-reel-kinetic.mp4",
  "demo-reel-story.mp4",
  "demo-showreel.mp4",
  "demo-thumbnail-16x9.jpg",
  "demo-vertical-reel.mp4",
  "reel-cover-1.jpg",
  "reel-cover-2.jpg",
  "reel-cover-3.jpg",
  "showcase-1-1.png",
  "showcase-1.png",
  "showcase-2-1.png",
  "showcase-2.png",
  "showcase-3-1.png",
  "showcase-3.png",
  "showcase-4-1.png",
  "showcase-4.png",
  "showcase-5-1.png",
  "showcase-5.png",
  "showcase-6-1.png",
  "showcase-6.png",
  "showcase-7.png",
  "showcase-album-2.png",
  "showcase-album-3.png",
  "showcase-flyer-1.png",
  "showcase-flyer-6.webp",
  "showcase-logo-10.png",
  "showcase-logo-12.png",
  "showcase-logo-13.png",
  "showcase-logo-14.png",
  "showcase-logo-15.png",
  "showcase-logo-16.jpg",
  "showcase-logo-17.svg",
  "showcase-logo-18-noxx.png",
  "showcase-logo-18-yurane.jpg",
  "showcase-logo-19-grab-gadgets.png",
  "showcase-logo-21-create-for-me.png",
  "showcase-logo-23-make-the-vibes.png",
  "showcase-logo-24-leader-lessons.webp",
  "showcase-logo-25-gradient-mark.jpg",
  "showcase-logo-3.jpg",
  "showcase-logo-4.png",
  "showcase-logo-5.png",
  "showcase-logo-6.png",
  "showcase-logo-8.png",
  "showcase-poster-13.webp",
  "showcase-poster-14.png",
  "showcase-poster-15.png",
  "showcase-poster-17.webp",
  "showcase-poster-18.webp",
]);

export interface CanvasCmsStoreData {
  addedItems: PortfolioCanvasProject[];
  deletedIds: string[];
  overrides: Record<string, Partial<PortfolioCanvasProject>>;
  updatedAt: string;
}

function getCanvasCmsPaths() {
  const dataDir = path.resolve(process.cwd(), "data");
  const canvasCmsFile = path.join(dataDir, "canvas-cms.json");
  return { dataDir, canvasCmsFile };
}

const globalCmsState = globalThis as unknown as {
  __GRVNTH_CMS_STORE__?: CanvasCmsStoreData;
};

function readCanvasCmsStore(): CanvasCmsStoreData {
  try {
    const { canvasCmsFile } = getCanvasCmsPaths();
    if (fs.existsSync(canvasCmsFile)) {
      const raw = fs.readFileSync(canvasCmsFile, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CanvasCmsStoreData>;
      const normalized: CanvasCmsStoreData = {
        addedItems: Array.isArray(parsed.addedItems) ? parsed.addedItems : [],
        deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
        overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
      globalCmsState.__GRVNTH_CMS_STORE__ = normalized;
      return normalized;
    }
  } catch {
    // Use memory store fallback
  }

  if (!globalCmsState.__GRVNTH_CMS_STORE__) {
    globalCmsState.__GRVNTH_CMS_STORE__ = {
      addedItems: [],
      deletedIds: [],
      overrides: {},
      updatedAt: new Date(0).toISOString(),
    };
  }
  return globalCmsState.__GRVNTH_CMS_STORE__;
}

function writeCanvasCmsStore(store: CanvasCmsStoreData): CanvasCmsStoreData {
  store.updatedAt = new Date().toISOString();
  globalCmsState.__GRVNTH_CMS_STORE__ = store;
  try {
    const { dataDir, canvasCmsFile } = getCanvasCmsPaths();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(canvasCmsFile, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Canvas CMS] Memory fallback active (disk write skipped):", err);
  }
  return store;
}

function getAllOccupiedRects(items: PortfolioCanvasProject[]): CanvasRect[] {
  return expandCanvasProjects(items).map((p) => ({
    canvasX: p.canvasX,
    canvasY: p.canvasY,
    width: p.width,
    height: p.height,
  }));
}

function buildResolvedCanvasItems(explicitStore?: CanvasCmsStoreData): {
  items: PortfolioCanvasProject[];
  deletedDefaultCount: number;
  updatedAt: string;
} {
  const store = explicitStore ?? readCanvasCmsStore();
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
  };
}

export const getCanvasCmsStateServer = createServerFn({ method: "GET" }).handler(async () => {
  return buildResolvedCanvasItems();
});

export const getExtraCanvasMediaServer = createServerFn({ method: "GET" }).handler(async () => {
  const { items } = buildResolvedCanvasItems();
  const baseIds = new Set(PORTFOLIO_CANVAS_PROJECTS.map((p) => p.id));
  return expandCanvasProjects(items)
    .filter((item) => !baseIds.has(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      mediaType: item.mediaType,
      url: item.videoUrl || item.imageUrl,
    }));
});

export const addCanvasCmsItemsServer = createServerFn({ method: "POST" })
  .validator(
    (payload: {
      items: Array<
        PortfolioCanvasProjectInput & {
          extraMedia?: CanvasExtraMediaItem[];
        }
      >;
    }) => payload,
  )
  .handler(async ({ data }) => {
    const store = readCanvasCmsStore();
    const { items: currentItems } = buildResolvedCanvasItems();
    const occupiedRects = getAllOccupiedRects(currentItems);

    for (const raw of data.items) {
      const mediaType: "image" | "video" =
        raw.mediaType === "video" ||
        Boolean(raw.videoUrl) ||
        /\.(mp4|webm|mov|m4v|ogg|ogv)(?:[?#]|$)/i.test(raw.imageUrl || "")
          ? "video"
          : "image";

      const width =
        raw.width && raw.width > 0 ? Math.round(raw.width) : mediaType === "video" ? 270 : 310;
      const height =
        raw.height && raw.height > 0 ? Math.round(raw.height) : mediaType === "video" ? 380 : 310;

      const pos =
        typeof raw.canvasX === "number" && typeof raw.canvasY === "number"
          ? { canvasX: Math.round(raw.canvasX), canvasY: Math.round(raw.canvasY) }
          : findRandomCanvasPosition(occupiedRects, width, height);

      occupiedRects.push({
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
              : findRandomCanvasPosition(occupiedRects, eWidth, eHeight);

          occupiedRects.push({
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

      const primaryUrl = raw.imageUrl || raw.videoUrl || "/media/showcase-1.png";
      const created: PortfolioCanvasProject = {
        id: raw.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

    writeCanvasCmsStore(store);
    return buildResolvedCanvasItems();
  });

export const updateCanvasCmsItemServer = createServerFn({ method: "POST" })
  .validator(
    (payload: {
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
    }) => payload,
  )
  .handler(async ({ data }) => {
    const store = readCanvasCmsStore();
    const addedIndex = store.addedItems.findIndex((item) => item.id === data.id);

    if (addedIndex !== -1) {
      const current = store.addedItems[addedIndex];
      store.addedItems[addedIndex] = {
        ...current,
        ...(data.title !== undefined ? { title: data.title.trim() || current.title } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.year !== undefined ? { year: data.year.trim() } : {}),
        ...(data.externalUrl !== undefined
          ? { externalUrl: data.externalUrl.trim() || undefined }
          : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl || undefined } : {}),
        ...(data.mediaType !== undefined ? { mediaType: data.mediaType } : {}),
        ...(typeof data.width === "number" && data.width > 0
          ? { width: Math.round(data.width) }
          : {}),
        ...(typeof data.height === "number" && data.height > 0
          ? { height: Math.round(data.height) }
          : {}),
        ...(typeof data.canvasX === "number" ? { canvasX: Math.round(data.canvasX) } : {}),
        ...(typeof data.canvasY === "number" ? { canvasY: Math.round(data.canvasY) } : {}),
      };
    } else {
      const prevOverride = store.overrides[data.id] ?? {};
      store.overrides[data.id] = {
        ...prevOverride,
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.year !== undefined ? { year: data.year.trim() } : {}),
        ...(data.externalUrl !== undefined
          ? { externalUrl: data.externalUrl.trim() || undefined }
          : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl || undefined } : {}),
        ...(data.mediaType !== undefined ? { mediaType: data.mediaType } : {}),
        ...(typeof data.width === "number" && data.width > 0
          ? { width: Math.round(data.width) }
          : {}),
        ...(typeof data.height === "number" && data.height > 0
          ? { height: Math.round(data.height) }
          : {}),
        ...(typeof data.canvasX === "number" ? { canvasX: Math.round(data.canvasX) } : {}),
        ...(typeof data.canvasY === "number" ? { canvasY: Math.round(data.canvasY) } : {}),
      };
    }

    writeCanvasCmsStore(store);
    return buildResolvedCanvasItems();
  });

export const addMediaToCanvasItemServer = createServerFn({ method: "POST" })
  .validator(
    (payload: {
      itemId: string;
      media: Array<{
        title?: string;
        mediaType: "image" | "video";
        url: string;
        width?: number;
        height?: number;
      }>;
    }) => payload,
  )
  .handler(async ({ data }) => {
    const store = readCanvasCmsStore();
    const { items: currentItems } = buildResolvedCanvasItems();
    const occupiedRects = getAllOccupiedRects(currentItems);

    const newExtras: CanvasExtraMediaItem[] = data.media.map((m) => {
      const width =
        m.width && m.width > 0 ? Math.round(m.width) : m.mediaType === "video" ? 270 : 310;
      const height =
        m.height && m.height > 0 ? Math.round(m.height) : m.mediaType === "video" ? 380 : 310;
      const pos = findRandomCanvasPosition(occupiedRects, width, height);
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

    const addedIndex = store.addedItems.findIndex((item) => item.id === data.itemId);
    if (addedIndex !== -1) {
      const current = store.addedItems[addedIndex];
      store.addedItems[addedIndex] = {
        ...current,
        extraMedia: [...(current.extraMedia ?? []), ...newExtras],
      };
    } else {
      const baseItem = PORTFOLIO_CANVAS_PROJECTS.find((p) => p.id === data.itemId);
      const prevOverride = store.overrides[data.itemId] ?? {};
      const existingExtra = prevOverride.extraMedia ?? baseItem?.extraMedia ?? [];
      store.overrides[data.itemId] = {
        ...prevOverride,
        extraMedia: [...existingExtra, ...newExtras],
      };
    }

    writeCanvasCmsStore(store);
    return buildResolvedCanvasItems();
  });

export const deleteMediaFromCanvasItemServer = createServerFn({ method: "POST" })
  .validator((payload: { itemId: string; mediaId: string }) => payload)
  .handler(async ({ data }) => {
    const store = readCanvasCmsStore();
    const addedIndex = store.addedItems.findIndex((item) => item.id === data.itemId);

    if (addedIndex !== -1) {
      const current = store.addedItems[addedIndex];
      const extras = current.extraMedia ?? [];
      if (data.mediaId === "primary") {
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
        }
      } else {
        const filtered = extras.filter((m) => m.id !== data.mediaId);
        store.addedItems[addedIndex] = {
          ...current,
          extraMedia: filtered.length > 0 ? filtered : undefined,
        };
      }
    } else {
      const baseItem = PORTFOLIO_CANVAS_PROJECTS.find((p) => p.id === data.itemId);
      if (baseItem) {
        const prevOverride = store.overrides[data.itemId] ?? {};
        const extras = prevOverride.extraMedia ?? baseItem.extraMedia ?? [];
        if (data.mediaId === "primary") {
          if (extras.length > 0) {
            const [promoted, ...rest] = extras;
            store.overrides[data.itemId] = {
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
          } else if (!store.deletedIds.includes(data.itemId)) {
            store.deletedIds.push(data.itemId);
          }
        } else {
          store.overrides[data.itemId] = {
            ...prevOverride,
            extraMedia: extras.filter((m) => m.id !== data.mediaId),
          };
        }
      }
    }

    writeCanvasCmsStore(store);
    return buildResolvedCanvasItems();
  });

export const randomizeCanvasItemPositionServer = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const store = readCanvasCmsStore();
    const { items: currentItems } = buildResolvedCanvasItems();
    const otherRects = expandCanvasProjects(currentItems.filter((i) => i.id !== id)).map((p) => ({
      canvasX: p.canvasX,
      canvasY: p.canvasY,
      width: p.width,
      height: p.height,
    }));

    const target = currentItems.find((i) => i.id === id);
    if (!target) return buildResolvedCanvasItems();

    const newPos = findRandomCanvasPosition(otherRects, target.width, target.height);
    otherRects.push({
      canvasX: newPos.canvasX,
      canvasY: newPos.canvasY,
      width: target.width,
      height: target.height,
    });

    const randomizedExtra = target.extraMedia?.map((extra) => {
      const ePos = findRandomCanvasPosition(otherRects, extra.width, extra.height);
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

    writeCanvasCmsStore(store);
    return buildResolvedCanvasItems();
  });

export const deleteCanvasCmsItemServer = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const store = readCanvasCmsStore();
    const addedIndex = store.addedItems.findIndex((item) => item.id === id);
    if (addedIndex !== -1) {
      store.addedItems.splice(addedIndex, 1);
    }
    if (!store.deletedIds.includes(id)) {
      store.deletedIds.push(id);
    }
    delete store.overrides[id];
    writeCanvasCmsStore(store);
    return buildResolvedCanvasItems();
  });

export const getPublishedPortfolio = createServerFn({ method: "GET" }).handler(async () => {
  // Automatic background change detection & synchronization
  const cms = getCmsData();
  const folderId = cms.syncState.root_folder_id;
  const token = cms.syncState.access_token;

  if (folderId) {
    const lastSynced = cms.syncState.last_synced
      ? new Date(cms.syncState.last_synced).getTime()
      : 0;
    const now = Date.now();
    // Auto-sync if portfolio is empty or if more than 20 seconds have elapsed since last sync
    if (
      (cms.projects.length === 0 || now - lastSynced > 20000) &&
      cms.syncState.sync_status !== "syncing"
    ) {
      void syncGoogleDriveRoot(folderId, token || null).catch((err) => {
        console.warn(
          "[Drive Auto-Sync] Background refresh:",
          err instanceof Error ? err.message : err,
        );
      });
    }
  }

  // 1. First priority: Google Drive CMS data
  const driveData = getPublicPortfolioData();
  if (driveData.sections.length > 0 && driveData.projects.length > 0) {
    return {
      sections: driveData.sections.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        cover_path: s.cover_path,
        display_order: s.display_order,
        visible: s.visible,
      })),
      projects: driveData.projects.map((p) => ({
        id: p.id,
        section_id: p.section_id,
        title: p.title,
        description: p.description,
        media_paths: p.media_paths,
        video_path: p.video_path,
        video_url: p.video_url,
        tags: p.tags,
        client_name: p.client_name,
        project_year: p.project_year,
        featured: p.featured,
        display_order: p.display_order,
        published: p.published,
      })),
      expiresIn: 3600,
    };
  }

  // 2. Supabase fallback if configured
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (url && key) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const publicClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const [{ data: sections }, { data: projects }] = await Promise.all([
        publicClient
          .from("portfolio_sections")
          .select("id,name,slug,description,cover_path,display_order,visible")
          .eq("visible", true)
          .order("display_order"),
        publicClient
          .from("portfolio_projects")
          .select(
            "id,section_id,title,description,media_paths,video_path,video_url,tags,client_name,project_year,featured,display_order,published",
          )
          .eq("published", true)
          .order("display_order"),
      ]);

      if (sections && projects && sections.length > 0) {
        return {
          sections,
          projects,
          expiresIn: 3600,
        };
      }
    } catch {
      // Fallback
    }
  }

  // 3. Bundled work fallback
  return {
    sections: [],
    projects: [],
    expiresIn: 3600,
  };
});
