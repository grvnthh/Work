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
  videoUrl?: string;
  canvasX?: number;
  canvasY?: number;
  width?: number;
  height?: number;
  externalUrl?: string;
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

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidateX = Math.round(minX + Math.random() * (maxX - minX));
    const candidateY = Math.round(minY + Math.random() * (maxY - minY));

    if (!doesRectOverlapAny(candidateX, candidateY, width, height, existingRects, minGap)) {
      return { canvasX: candidateX, canvasY: candidateY };
    }
  }

  return { canvasX: padding, canvasY: padding };
}

export function resolveNonOverlappingProjects(
  projects: PortfolioCanvasProject[],
): PortfolioCanvasProject[] {
  return projects;
}

export const PORTFOLIO_CANVAS_PROJECTS: PortfolioCanvasProject[] = [];
