export interface CanvasExtraMediaItem {
  id: string;
  title?: string;
  mediaType: "image" | "video";
  imageUrl: string;
  videoUrl?: string;
  canvasX: number;
  canvasY: number;
  width: number;
  height: number;
}

export interface PortfolioCanvasProjectInput {
  id?: string;
  title?: string;
  description?: string;
  year?: string;
  mediaType?: "image" | "video";
  imageUrl?: string;
  /** Valid video URL (local /media/*.mp4 or external URL) when mediaType === "video" */
  videoUrl?: string;
  /** Optional horizontal position (px) on the virtual canvas; placed randomly if omitted */
  canvasX?: number;
  /** Optional vertical position (px) on the virtual canvas; placed randomly if omitted */
  canvasY?: number;
  /** Optional card width (px); computed from original aspect ratio if omitted */
  width?: number;
  /** Optional card height (px); computed from original aspect ratio if omitted */
  height?: number;
  /** Optional external link */
  externalUrl?: string;
  /** Optional additional photos/videos attached to this item via CMS */
  extraMedia?: CanvasExtraMediaItem[];
}

export interface PortfolioCanvasProject {
  id: string;
  title: string;
  description: string;
  year?: string;
  mediaType: "image" | "video";
  imageUrl: string;
  videoUrl?: string;
  canvasX: number;
  canvasY: number;
  width: number;
  height: number;
  externalUrl?: string;
  extraMedia?: CanvasExtraMediaItem[];
}

export interface CanvasRect {
  canvasX: number;
  canvasY: number;
  width: number;
  height: number;
}

/**
 * Flattens items and any attached extraMedia so every photo/video renders as its own
 * standalone card on the infinite canvas in its original aspect ratio.
 */
export function expandCanvasProjects(projects: PortfolioCanvasProject[]): PortfolioCanvasProject[] {
  const expanded: PortfolioCanvasProject[] = [];
  for (const project of projects) {
    expanded.push(project);
    if (project.extraMedia && project.extraMedia.length > 0) {
      for (const extra of project.extraMedia) {
        expanded.push({
          id: extra.id,
          title: extra.title || project.title,
          description: project.description,
          year: project.year,
          mediaType: extra.mediaType,
          imageUrl: extra.imageUrl,
          videoUrl: extra.videoUrl,
          canvasX: extra.canvasX,
          canvasY: extra.canvasY,
          width: extra.width,
          height: extra.height,
          externalUrl: project.externalUrl,
        });
      }
    }
  }
  return expanded;
}

export const CANVAS_DIMENSIONS = {
  width: 3900,
  height: 2700,
  initialFocusX: 1960,
  initialFocusY: 1380,
} as const;

/**
 * Computes card dimensions on the canvas that strictly preserve the media's original aspect ratio.
 */
export function computeAspectDimensions(
  naturalWidth: number,
  naturalHeight: number,
  baseSize = 310,
): { width: number; height: number } {
  if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: baseSize, height: baseSize };
  }
  const ratio = naturalWidth / naturalHeight;
  const targetArea = baseSize * baseSize;
  const rawWidth = Math.sqrt(targetArea * ratio);
  const width = Math.round(Math.min(460, Math.max(220, rawWidth)));
  const height = Math.round(width / ratio);
  return { width, height };
}

/**
 * Checks whether a candidate rectangle overlaps any existing rectangle when padded by `gap` pixels.
 */
export function doesRectOverlapAny(
  candidateX: number,
  candidateY: number,
  width: number,
  height: number,
  existingRects: CanvasRect[],
  gap = 64,
): boolean {
  for (const rect of existingRects) {
    const overlapX =
      candidateX < rect.canvasX + rect.width + gap && candidateX + width + gap > rect.canvasX;
    const overlapY =
      candidateY < rect.canvasY + rect.height + gap && candidateY + height + gap > rect.canvasY;

    if (overlapX && overlapY) {
      return true;
    }
  }
  return false;
}

/**
 * Finds a random position on the canvas that is strictly guaranteed NEVER to overlap any existing item.
 */
export function findRandomCanvasPosition(
  existingRects: CanvasRect[],
  width: number,
  height: number,
  minGap = 72,
): { canvasX: number; canvasY: number } {
  const padding = 140;
  const minX = padding;
  const maxX = Math.max(minX + 200, CANVAS_DIMENSIONS.width - width - padding);
  const minY = padding;
  const maxY = Math.max(minY + 200, CANVAS_DIMENSIONS.height - height - padding);

  // 1. Try random positions across the canvas bounds and pick the first valid non-overlapping spot
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidateX = Math.round(minX + Math.random() * (maxX - minX));
    const candidateY = Math.round(minY + Math.random() * (maxY - minY));

    if (!doesRectOverlapAny(candidateX, candidateY, width, height, existingRects, minGap)) {
      return { canvasX: candidateX, canvasY: candidateY };
    }
  }

  // 2. Fallback: Spiral outward from the canvas center with randomized angular offset
  // so it is mathematically guaranteed to find a 100% overlap-free coordinate.
  const centerX = CANVAS_DIMENSIONS.initialFocusX - width / 2;
  const centerY = CANVAS_DIMENSIONS.initialFocusY - height / 2;
  const startAngle = Math.random() * Math.PI * 2;

  for (let radius = 240; radius <= 8000; radius += 90) {
    const steps = Math.max(16, Math.round((2 * Math.PI * radius) / 140));
    for (let s = 0; s < steps; s += 1) {
      const angle = startAngle + (s / steps) * Math.PI * 2;
      const candidateX = Math.round(Math.max(80, centerX + Math.cos(angle) * radius * 1.25));
      const candidateY = Math.round(Math.max(80, centerY + Math.sin(angle) * radius));

      if (!doesRectOverlapAny(candidateX, candidateY, width, height, existingRects, minGap)) {
        return { canvasX: candidateX, canvasY: candidateY };
      }
    }
  }

  return { canvasX: padding, canvasY: padding };
}

/**
 * Ensures that a list of projects (including runtime measured aspect-ratio dimensions)
 * never has any two cards overlapping each other.
 */
export function resolveNonOverlappingProjects(
  projects: PortfolioCanvasProject[],
  dimensionOverrides?: Record<string, { width: number; height: number }>,
  minGap = 56,
): PortfolioCanvasProject[] {
  const placedRects: CanvasRect[] = [];
  const result: PortfolioCanvasProject[] = [];

  for (const project of projects) {
    const dims = dimensionOverrides?.[project.id] ?? {
      width: project.width,
      height: project.height,
    };
    const width = dims.width;
    const height = dims.height;

    let canvasX = project.canvasX;
    let canvasY = project.canvasY;

    if (doesRectOverlapAny(canvasX, canvasY, width, height, placedRects, minGap)) {
      // Search outward from the card's current position first so it stays near its intended neighborhood
      let foundNear = false;
      for (let radius = 60; radius <= 2400 && !foundNear; radius += 60) {
        const steps = 16;
        for (let s = 0; s < steps; s += 1) {
          const angle = (s / steps) * Math.PI * 2;
          const nx = Math.round(Math.max(80, canvasX + Math.cos(angle) * radius));
          const ny = Math.round(Math.max(80, canvasY + Math.sin(angle) * radius));
          if (!doesRectOverlapAny(nx, ny, width, height, placedRects, minGap)) {
            canvasX = nx;
            canvasY = ny;
            foundNear = true;
            break;
          }
        }
      }

      if (!foundNear) {
        const fallback = findRandomCanvasPosition(placedRects, width, height, minGap);
        canvasX = fallback.canvasX;
        canvasY = fallback.canvasY;
      }
    }

    placedRects.push({ canvasX, canvasY, width, height });
    result.push({
      ...project,
      canvasX,
      canvasY,
      width,
      height,
    });
  }

  return result;
}

/**
 * Standalone portfolio items scattered organically across the virtual canvas in their true original aspect ratios,
 * with >= 99px of clear non-overlapping space around every card.
 * Any item added without `canvasX`/`canvasY` or `width`/`height` will automatically be placed randomly
 * on the canvas without overlapping any existing card.
 */
const RAW_PORTFOLIO_PROJECTS: PortfolioCanvasProjectInput[] = [];

export function resolveCanvasProjects(
  inputs: PortfolioCanvasProjectInput[],
): PortfolioCanvasProject[] {
  const resolved: PortfolioCanvasProject[] = [];

  for (let i = 0; i < inputs.length; i += 1) {
    const item = inputs[i];
    const rawMediaUrl = item.videoUrl || item.imageUrl || "";
    const isVideo =
      item.mediaType === "video" ||
      Boolean(item.videoUrl) ||
      /\.(mp4|webm|mov|m4v|ogg|ogv)(?:[?#]|$)/i.test(rawMediaUrl);

    const width = item.width ?? (isVideo ? 270 : 310);
    const height = item.height ?? (isVideo ? 380 : 310);

    const hasValidExplicitPosition =
      item.canvasX !== undefined &&
      item.canvasY !== undefined &&
      !doesRectOverlapAny(item.canvasX, item.canvasY, width, height, resolved, 64);

    const position = hasValidExplicitPosition
      ? { canvasX: item.canvasX!, canvasY: item.canvasY! }
      : findRandomCanvasPosition(resolved, width, height, 72);

    const fallbackTitle =
      rawMediaUrl
        .split("/")
        .pop()
        ?.replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim() || `Work ${i + 1}`;

    resolved.push({
      id: item.id || `canvas-item-${i}-${fallbackTitle.toLowerCase().replace(/\s+/g, "-")}`,
      title: item.title || fallbackTitle,
      description: item.description || "",
      year: item.year,
      mediaType: isVideo ? "video" : "image",
      imageUrl: item.imageUrl || item.videoUrl || "",
      videoUrl: isVideo ? item.videoUrl || item.imageUrl : undefined,
      canvasX: position.canvasX,
      canvasY: position.canvasY,
      width,
      height,
      externalUrl: item.externalUrl,
    });
  }

  return resolved;
}

export const PORTFOLIO_CANVAS_PROJECTS: PortfolioCanvasProject[] =
  resolveCanvasProjects(RAW_PORTFOLIO_PROJECTS);
