import fs from "node:fs";
import path from "node:path";
import { getCmsData } from "./store";

const CACHE_DIR = path.resolve(process.cwd(), "data", "media-cache");

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function getMediaProxyUrl(fileId: string, filename?: string): string {
  const nameParam = filename ? `&name=${encodeURIComponent(filename)}` : "";
  return `/api/drive-media?id=${encodeURIComponent(fileId)}${nameParam}`;
}

export type CachedMediaMeta = {
  mimeType: string;
  size: number;
  filename: string;
  cachedAt: number;
};

export async function fetchAndCacheDriveFile(
  fileId: string,
  token?: string | null,
  hintFilename?: string,
): Promise<{ filePath: string; meta: CachedMediaMeta } | null> {
  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${fileId}.bin`);
  const metaPath = path.join(CACHE_DIR, `${fileId}.json`);

  if (fs.existsSync(filePath) && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as CachedMediaMeta;
      return { filePath, meta };
    } catch {
      // Re-fetch if corrupt
    }
  }

  // Determine token: parameter or from cms store
  const currentToken = token || getCmsData().syncState.access_token;

  let res: Response | null = null;

  // Try Drive API download with access token if available
  if (currentToken) {
    try {
      res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });
      if (!res.ok) {
        console.warn(`[Drive Media] Authenticated fetch failed for ${fileId}: ${res.status}`);
        res = null;
      }
    } catch (e) {
      console.warn(`[Drive Media] Error fetching with token for ${fileId}:`, e);
      res = null;
    }
  }

  // Fallback: Google Drive high-resolution direct export / thumbnail
  if (!res || !res.ok) {
    try {
      res = await fetch(`https://drive.google.com/thumbnail?id=${fileId}&sz=w2560`);
      if (!res.ok) {
        res = await fetch(`https://lh3.googleusercontent.com/d/${fileId}=w2560`);
      }
    } catch (e) {
      console.warn(`[Drive Media] Fallback thumbnail fetch failed for ${fileId}:`, e);
    }
  }

  if (!res || !res.ok) {
    return null;
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());

  fs.writeFileSync(filePath, buffer);
  const meta: CachedMediaMeta = {
    mimeType: contentType,
    size: buffer.byteLength,
    filename: hintFilename || `${fileId}`,
    cachedAt: Date.now(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  return { filePath, meta };
}
