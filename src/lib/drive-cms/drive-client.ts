import type { CmsSection, CmsProject, DriveAsset, DriveMediaKind, CmsStoreData } from "./types";
import { getCmsData, saveCmsData, updateSyncState } from "./store";
import { getMediaProxyUrl, fetchAndCacheDriveFile } from "./media-cache";

export type GoogleDriveRawFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  thumbnailLink?: string;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

// Extensions check
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "tiff", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "m4v", "mkv", "avi"]);
const DOC_EXTS = new Set(["pdf"]);

export function getFileKind(name: string, mimeType: string): DriveMediaKind | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";

  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (DOC_EXTS.has(ext)) return "pdf";

  return null;
}

export function isSupportedMedia(name: string, mimeType: string): boolean {
  return getFileKind(name, mimeType) !== null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanProjectTitle(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot > 0) {
    return filename.slice(0, lastDot).trim();
  }
  return filename.trim();
}

/**
 * Drive API helper to fetch list of files via OAuth token
 */
async function driveFetchList(
  query: string,
  token: string,
  fields = "files(id, name, mimeType, size, modifiedTime, parents, thumbnailLink)",
): Promise<GoogleDriveRawFile[]> {
  const allFiles: GoogleDriveRawFile[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken, ${fields}`,
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Google Drive API error (${res.status}): ${errBody}`);
    }

    const data = (await res.json()) as { files?: GoogleDriveRawFile[]; nextPageToken?: string };
    if (data.files) {
      allFiles.push(...data.files);
    }
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);

  return allFiles;
}

/**
 * Discover all folders in user's Drive for root folder selection
 */
export async function listUserDriveFolders(
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  try {
    const query = `mimeType = '${FOLDER_MIME}' and trashed = false`;
    const files = await driveFetchList(query, token, "files(id, name)");
    return files.map((f) => ({ id: f.id, name: f.name }));
  } catch {
    return [];
  }
}

/**
 * Recursively find all supported media files inside a folder and its subfolders via OAuth
 */
async function recursiveFindAssets(
  folderId: string,
  token: string,
  currentPath = "",
): Promise<DriveAsset[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const children = await driveFetchList(query, token);

  const assets: DriveAsset[] = [];

  for (const child of children) {
    if (child.mimeType === FOLDER_MIME) {
      const subAssets = await recursiveFindAssets(
        child.id,
        token,
        currentPath ? `${currentPath}/${child.name}` : child.name,
      );
      assets.push(...subAssets);
    } else {
      const kind = getFileKind(child.name, child.mimeType);
      if (kind) {
        assets.push({
          id: child.id,
          name: child.name,
          mimeType: child.mimeType,
          url: getMediaProxyUrl(child.id, child.name),
          thumbnailUrl: child.thumbnailLink,
          kind,
          size: child.size ? parseInt(child.size, 10) : undefined,
          relativePath: currentPath ? `${currentPath}/${child.name}` : child.name,
        });
      }
    }
  }

  return assets;
}

/**
 * Cover Image Heuristic
 */
export function chooseProjectCover(assets: DriveAsset[]): string | null {
  if (assets.length === 0) return null;
  const priorityPattern = /(cover|thumbnail|main|hero|preview)/i;

  const priorityImage = assets.find((a) => a.kind === "image" && priorityPattern.test(a.name));
  if (priorityImage) return priorityImage.url;

  const firstImage = assets.find((a) => a.kind === "image");
  if (firstImage) return firstImage.url;

  const anyPriority = assets.find((a) => priorityPattern.test(a.name));
  if (anyPriority) return anyPriority.url;

  return assets[0].url;
}

/**
 * Public Google Drive Folder HTML Item Extractor
 * Allows direct scraping of shared Drive folders without requiring active OAuth tokens
 */
async function fetchPublicFolderItems(
  folderId: string,
): Promise<Array<{ id: string; name: string; isFolder: boolean; kind: DriveMediaKind }>> {
  const url = `https://drive.google.com/drive/folders/${folderId}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const matches = Array.from(
      html.matchAll(
        /aria-label="([^"]+?)"[^>]*?ssk=['"][^:'"]*:[^:'"]*:([a-zA-Z0-9_.-]+?)(?:-\d+-\d+)?['"]/g,
      ),
    );

    const items: Array<{ id: string; name: string; isFolder: boolean; kind: DriveMediaKind }> = [];
    const seen = new Set<string>();

    for (const match of matches) {
      const rawLabel = match[1];
      const fid = match[2];

      if (
        ["More actions", "Thumbnail view", "List view", "Grid view", "New"].includes(rawLabel) ||
        rawLabel.startsWith("Modified ") ||
        rawLabel.startsWith("Size: ") ||
        rawLabel.startsWith("Storage used: ") ||
        rawLabel.startsWith("Open with")
      ) {
        continue;
      }

      const cleanId = fid.replace(/-\d+-\d+$/, "");
      if (seen.has(cleanId)) continue;
      seen.add(cleanId);

      const isFolder = /Shared folder|Google Drive Folder|folder/i.test(rawLabel);

      let kind: DriveMediaKind = "image";
      if (/Video/i.test(rawLabel)) kind = "video";
      else if (/PDF/i.test(rawLabel)) kind = "pdf";

      const name = rawLabel
        .replace(
          /\s+(?:Shared folder|Google Drive Folder|folder|Image Shared|Video Shared|PDF Shared|Shared)\s*$/i,
          "",
        )
        .trim();

      items.push({ id: cleanId, name, isFolder, kind });
    }

    return items;
  } catch (error) {
    console.warn(`[Drive Scraper] Error fetching folder ${folderId}:`, error);
    return [];
  }
}

/**
 * Direct public Drive reconciliation
 * Automatically reflects additions and deletions in public Google Drive folders!
 */
export async function syncPublicDriveFolder(rootFolderId: string): Promise<{
  sectionsCount: number;
  projectsCount: number;
  errors: string[];
}> {
  updateSyncState({ sync_status: "syncing", last_error: null });
  const errors: string[] = [];

  let rawSections: Array<{ id: string; name: string; isFolder: boolean; kind: DriveMediaKind }>;
  try {
    rawSections = await fetchPublicFolderItems(rootFolderId);
    if (rawSections.length === 0) {
      throw new Error(
        "Could not read sections from Google Drive folder. Please verify folder link or permissions.",
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateSyncState({ sync_status: "synced", last_error: msg });
    throw err;
  }

  const currentData = getCmsData();
  const existingSectionsByDriveId = new Map(currentData.sections.map((s) => [s.drive_id, s]));
  const existingProjectsByDriveId = new Map(currentData.projects.map((p) => [p.drive_id, p]));

  const reconciledSections: CmsSection[] = [];
  const reconciledProjects: CmsProject[] = [];

  for (let sIdx = 0; sIdx < rawSections.length; sIdx += 1) {
    const secRaw = rawSections[sIdx];
    if (!secRaw.isFolder) continue;

    const existingSec = existingSectionsByDriveId.get(secRaw.id);
    const secId = existingSec?.id || secRaw.id;
    const secName = existingSec?.name || secRaw.name.replace(/_/g, " ").trim();
    const secSlug = existingSec?.slug || slugify(secRaw.name);

    const sectionItems = await fetchPublicFolderItems(secRaw.id);

    let secCover: string | null = existingSec?.cover_path || null;

    let projectOrder = 0;
    for (const itm of sectionItems) {
      const existingProj = existingProjectsByDriveId.get(itm.id);
      const projId = existingProj?.id || itm.id;
      const projTitle = existingProj?.title || itm.name;

      const mediaUrl = getMediaProxyUrl(itm.id, itm.name);
      if (!secCover && itm.kind === "image") {
        secCover = mediaUrl;
      }

      const asset: DriveAsset = {
        id: itm.id,
        name: itm.name,
        mimeType:
          itm.kind === "video"
            ? "video/mp4"
            : itm.kind === "pdf"
              ? "application/pdf"
              : "image/jpeg",
        url: mediaUrl,
        kind: itm.kind,
      };

      const proj: CmsProject = {
        id: projId,
        drive_id: itm.id,
        drive_type: itm.isFolder ? "folder" : "file",
        section_id: secId,
        title: projTitle,
        description: existingProj?.description || "",
        media_paths: [mediaUrl],
        assets: [asset],
        cover_path: existingProj?.custom_cover_path || (itm.kind === "image" ? mediaUrl : null),
        custom_cover_path: existingProj?.custom_cover_path || null,
        video_path: itm.kind === "video" ? mediaUrl : null,
        video_url: existingProj?.video_url || null,
        tags: existingProj?.tags || [secName],
        client_name: existingProj?.client_name || null,
        project_year: existingProj?.project_year || 2026,
        featured: existingProj?.featured ?? projectOrder < 2,
        display_order: existingProj?.display_order ?? projectOrder,
        published: existingProj?.published ?? true,
        created_at: existingProj?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      reconciledProjects.push(proj);
      projectOrder += 1;
    }

    const section: CmsSection = {
      id: secId,
      drive_id: secRaw.id,
      name: secName,
      slug: secSlug,
      description:
        existingSec?.description ||
        `Explore creative ${secName.toLowerCase()} projects by Granth Agrawal.`,
      cover_path: secCover,
      display_order: existingSec?.display_order ?? sIdx,
      visible: existingSec?.visible ?? true,
      created_at: existingSec?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    reconciledSections.push(section);
  }

  // Save reconciled CMS store
  const updatedStore: CmsStoreData = {
    syncState: {
      connected: true,
      root_folder_id: rootFolderId,
      root_folder_name: "All Projects",
      access_token: currentData.syncState.access_token,
      sync_status: "synced",
      last_synced: new Date().toISOString(),
      last_error: null,
      start_page_token: null,
      total_sections: reconciledSections.length,
      total_projects: reconciledProjects.length,
    },
    sections: reconciledSections,
    projects: reconciledProjects,
  };

  saveCmsData(updatedStore);

  return {
    sectionsCount: reconciledSections.length,
    projectsCount: reconciledProjects.length,
    errors,
  };
}

/**
 * Main Synchronization Engine
 * Uses OAuth API if token available, or automatically falls back to Direct Public Drive Sync
 */
export async function syncGoogleDriveRoot(
  rootFolderId: string,
  token?: string | null,
): Promise<{
  sectionsCount: number;
  projectsCount: number;
  errors: string[];
}> {
  // If no token, or if OAuth fails, use the robust public folder direct sync
  if (!token) {
    return syncPublicDriveFolder(rootFolderId);
  }

  updateSyncState({ sync_status: "syncing", last_error: null });
  const errors: string[] = [];

  try {
    const rootRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${rootFolderId}?fields=id,name,trashed`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!rootRes.ok) {
      console.warn(`[Drive API] Failed (${rootRes.status}), falling back to public sync`);
      return syncPublicDriveFolder(rootFolderId);
    }

    const rootMeta = (await rootRes.json()) as { id: string; name: string; trashed?: boolean };
    if (rootMeta.trashed) {
      throw new Error("The selected Google Drive root folder is in the trash.");
    }

    const rootFolderName = rootMeta.name || "All Projects";

    const sectionFoldersQuery = `'${rootFolderId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const sectionFolders = await driveFetchList(sectionFoldersQuery, token);

    const currentData = getCmsData();
    const existingSectionsByDriveId = new Map(currentData.sections.map((s) => [s.drive_id, s]));
    const existingProjectsByDriveId = new Map(currentData.projects.map((p) => [p.drive_id, p]));

    const reconciledSections: CmsSection[] = [];
    const reconciledProjects: CmsProject[] = [];

    for (let secIdx = 0; secIdx < sectionFolders.length; secIdx += 1) {
      const folder = sectionFolders[secIdx];
      const existingSec = existingSectionsByDriveId.get(folder.id);

      const sectionId = existingSec?.id || folder.id;
      const sectionName = existingSec?.name || folder.name;
      const sectionSlug = existingSec?.slug || slugify(folder.name) || `section-${secIdx + 1}`;

      const section: CmsSection = {
        id: sectionId,
        drive_id: folder.id,
        name: sectionName,
        slug: sectionSlug,
        description: existingSec?.description || "",
        cover_path: existingSec?.cover_path || null,
        display_order: existingSec?.display_order ?? secIdx,
        visible: existingSec?.visible ?? true,
        created_at: existingSec?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      reconciledSections.push(section);

      const childrenQuery = `'${folder.id}' in parents and trashed = false`;
      const children = await driveFetchList(childrenQuery, token);

      let projectOrder = 0;

      for (const child of children) {
        if (child.mimeType === FOLDER_MIME) {
          const projectTitle = child.name;
          const existingProj = existingProjectsByDriveId.get(child.id);

          const assets = await recursiveFindAssets(child.id, token);
          if (assets.length === 0) continue;

          const mediaPaths = assets.map((a) => a.url);
          const autoCover = chooseProjectCover(assets);
          const coverPath = existingProj?.custom_cover_path || autoCover;

          const videoAsset = assets.find((a) => a.kind === "video");

          const proj: CmsProject = {
            id: existingProj?.id || child.id,
            drive_id: child.id,
            drive_type: "folder",
            section_id: sectionId,
            title: existingProj?.title || projectTitle,
            description: existingProj?.description || "",
            media_paths: mediaPaths,
            assets,
            cover_path: coverPath,
            custom_cover_path: existingProj?.custom_cover_path || null,
            video_path: videoAsset?.url || null,
            video_url: existingProj?.video_url || null,
            tags: existingProj?.tags || [],
            client_name: existingProj?.client_name || null,
            project_year: existingProj?.project_year || null,
            featured: existingProj?.featured || false,
            display_order: existingProj?.display_order ?? projectOrder,
            published: existingProj?.published ?? true,
            created_at: existingProj?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          reconciledProjects.push(proj);
          projectOrder += 1;
        } else {
          const kind = getFileKind(child.name, child.mimeType);
          if (!kind) continue;

          const projectTitle = cleanProjectTitle(child.name);
          const existingProj = existingProjectsByDriveId.get(child.id);

          const asset: DriveAsset = {
            id: child.id,
            name: child.name,
            mimeType: child.mimeType,
            url: getMediaProxyUrl(child.id, child.name),
            thumbnailUrl: child.thumbnailLink,
            kind,
            size: child.size ? parseInt(child.size, 10) : undefined,
          };

          const mediaPaths = [asset.url];
          const autoCover = asset.url;
          const coverPath = existingProj?.custom_cover_path || autoCover;

          const proj: CmsProject = {
            id: existingProj?.id || child.id,
            drive_id: child.id,
            drive_type: "file",
            section_id: sectionId,
            title: existingProj?.title || projectTitle,
            description: existingProj?.description || "",
            media_paths: mediaPaths,
            assets: [asset],
            cover_path: coverPath,
            custom_cover_path: existingProj?.custom_cover_path || null,
            video_path: kind === "video" ? asset.url : null,
            video_url: existingProj?.video_url || null,
            tags: existingProj?.tags || [],
            client_name: existingProj?.client_name || null,
            project_year: existingProj?.project_year || null,
            featured: existingProj?.featured || false,
            display_order: existingProj?.display_order ?? projectOrder,
            published: existingProj?.published ?? true,
            created_at: existingProj?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          reconciledProjects.push(proj);
          projectOrder += 1;
        }
      }

      const sectionProjects = reconciledProjects.filter((p) => p.section_id === sectionId);
      if (!section.cover_path && sectionProjects.length > 0 && sectionProjects[0].cover_path) {
        section.cover_path = sectionProjects[0].cover_path;
      }
    }

    const updatedStore: CmsStoreData = {
      syncState: {
        connected: true,
        root_folder_id: rootFolderId,
        root_folder_name: rootFolderName,
        access_token: token,
        sync_status: "synced",
        last_synced: new Date().toISOString(),
        last_error: null,
        start_page_token: null,
        total_sections: reconciledSections.length,
        total_projects: reconciledProjects.length,
      },
      sections: reconciledSections,
      projects: reconciledProjects,
    };

    saveCmsData(updatedStore);

    return {
      sectionsCount: reconciledSections.length,
      projectsCount: reconciledProjects.length,
      errors,
    };
  } catch (error) {
    console.warn("[Drive Sync] OAuth failed, attempting public sync fallback:", error);
    return syncPublicDriveFolder(rootFolderId);
  }
}
