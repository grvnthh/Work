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

export const PORTFOLIO_CANVAS_PROJECTS: PortfolioCanvasProject[] = [
  {
    id: "item-1792686624293-ydl94",
    title: "Reel Cover 1",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792686621714-hdiy-reel-cover-1.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY4NjYyMTcxNC1oZGl5LXJlZWwtY292ZXItMS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzkyNjg2NjI0LCJleHAiOjIxMDgwNDY2MjR9.KTpOd4hRJiDXuM7HeZTaQnqHyO3623ko4VTKIPEXlKbkBN90aJhg-uq32Nc9192MRGje8_Ag_j6NtaACnL3J4Q",
    canvasX: 2818,
    canvasY: 799,
    width: 232,
    height: 413,
  },
  {
    id: "item-1792663141957-zowcr",
    title: "Motion Graphic Intro Reel",
    description: "",
    year: "2026",
    mediaType: "video",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792663133800-5mbz-1000919768.mp4?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MzEzMzgwMC01bWJ6LTEwMDA5MTk3NjgubXA0Iiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.bgHhoZP8S4O5x2uRRAxa7u7_3UiRQbJ60zqybE1yEDV1hDDLQ3vrHe7HXf0A9u2jFSSpQPjrYib1dk-d1PK0sw",
    videoUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792663133800-5mbz-1000919768.mp4?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MzEzMzgwMC01bWJ6LTEwMDA5MTk3NjgubXA0Iiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.bgHhoZP8S4O5x2uRRAxa7u7_3UiRQbJ60zqybE1yEDV1hDDLQ3vrHe7HXf0A9u2jFSSpQPjrYib1dk-d1PK0sw",
    canvasX: 1934,
    canvasY: 1582,
    width: 413,
    height: 232,
  },
  {
    id: "item-1792663082601-7rcnm",
    title: "Motion Graphic Ad Reel",
    description: "",
    year: "2026",
    mediaType: "video",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792663079837-loih-1000919769.mp4?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MzA3OTgzNy1sb2loLTEwMDA5MTk3NjkubXA0Iiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjIzMSwiZXhwIjoyMTA4MDQyMjMxfQ.AFZIq-20bD6_0DiXVjcuhCkwFTc5isXJSM3Pp4uJYdKo7fsxedUfhcEKZQboo5icPxU5zintDgryVjJ-Vpy1Rg",
    videoUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792663079837-loih-1000919769.mp4?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MzA3OTgzNy1sb2loLTEwMDA5MTk3NjkubXA0Iiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjIzMSwiZXhwIjoyMTA4MDQyMjMxfQ.AFZIq-20bD6_0DiXVjcuhCkwFTc5isXJSM3Pp4uJYdKo7fsxedUfhcEKZQboo5icPxU5zintDgryVjJ-Vpy1Rg",
    canvasX: 1494,
    canvasY: 1406,
    width: 233,
    height: 414,
  },
  {
    id: "item-1792663060682-41p3f",
    title: "Personal Brand Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792663058818-yn89-1000919751.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MzA1ODgxOC15bjg5LTEwMDA5MTk3NTEucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.N6dAIxy0moiO27IZWor1SDUUPZ4JulrB2agPqolpAOZBZMQJTRKWZm6M3C939mTExfMMuJ5WQk0n7S5jOwm8Sw",
    canvasX: 2480,
    canvasY: 1296,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792662887094-uwciz",
    title: "Instagram Clothing Showcase Post",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662877273-scn0-1000919771.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2Mjg3NzI3My1zY24wLTEwMDA5MTk3NzEucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.OAdnFlnNk9XRGMJpMAG6RbyUhun2P8qz6HaUg5d8M4fe7n08dpAVjf5Aact-EpiqlvEEQZFQDYhAoqeuB4jddg",
    canvasX: 1953,
    canvasY: 1895,
    width: 277,
    height: 346,
  },
  {
    id: "item-1792662683713-anuze",
    title: "Music Album Cover",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662657297-quhn-1000919729.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjY1NzI5Ny1xdWhuLTEwMDA5MTk3MjkucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.vg3eOk0uhhdwbHT8_kBlVWdPbtJng36-d8ZcWvf0YLRHB-J4IdAj12lSfWStGZ-WMPWK4oEZQNv6Kg-u7e73FQ",
    canvasX: 1545,
    canvasY: 1940,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792662627525-q4q1d",
    title: "Music Album Cover",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662623998-3kpt-1000919730.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjYyMzk5OC0za3B0LTEwMDA5MTk3MzAucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjIzMSwiZXhwIjoyMTA4MDQyMjMxfQ.I3Re-Ewzpf3K1bCHNs5R7wFziej0mQ43XajbpjGfKx8VMEENfNlwThtGx6mo4TcVrUeVMCXA_C91YOHCa85InA",
    canvasX: 2326,
    canvasY: 1891,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792662410926-3ml76",
    title: "Minecraft Youtube Channel Banner",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662407814-ex76-1000919731.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjQwNzgxNC1leDc2LTEwMDA5MTk3MzEucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.IF585X8O4A9eYXxdPd7jhwglZJ1FC70aDuEzMpJuFpDGSgVZ0tZSesuXN8vrCCDLBqDTv5cTzRPHkgY6mXqbIg",
    canvasX: 995,
    canvasY: 1133,
    width: 460,
    height: 79,
  },
  {
    id: "item-1792662372397-ft720",
    title: "Brand Identity",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662370892-hn0u-1000919733.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjM3MDg5Mi1objB1LTEwMDA5MTk3MzMuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.5vkljK1GtNLbYjHShN7D9L37Px1QFB9vHwGJViAIlDtCD1aifGKl9Ej-xu7aq_z5QeOuWOMgPYveqS6XzEzYzw",
    canvasX: 1148,
    canvasY: 1456,
    width: 237,
    height: 404,
  },
  {
    id: "item-1792662342799-gwe93",
    title: "Instagram Skincare Campaign",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662340130-w2wh-1000919734.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjM0MDEzMC13MndoLTEwMDA5MTk3MzQucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.BFvDt8vl3bYOx9jOeKCwNhjY5qRsxWFKRiWPpPMZAkKmAMjUiaTGNDfj6uPra7kLnIzN44mRmNKum2W2P6LY4Q",
    canvasX: 1173,
    canvasY: 1977,
    width: 277,
    height: 348,
  },
  {
    id: "item-1792662315670-xmvqs",
    title: "Instagram Post",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662309049-4m0h-1000919740.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjMwOTA0OS00bTBoLTEwMDA5MTk3NDAucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.Z72WPAJo9lUiPbA3QfkRxTK-Ab8d5qGdyHpwhITYf2VFbUJKcdc9X-9MiemFXKrfzjKXRG0TDnoBKWQU_6n_yA",
    canvasX: 1174,
    canvasY: 603,
    width: 277,
    height: 346,
  },
  {
    id: "item-1792662293097-trwzr",
    title: "Instagram Post",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662290377-9uw0-1000919741.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjI5MDM3Ny05dXcwLTEwMDA5MTk3NDEucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.9Lzx5SyoF2GFmNdf7O9KToMbGhY0nxtPYIRUtQbcXX7F-jmEqqGTzgoFbos9VKyws_QmmJoxnry51A31jzERqg",
    canvasX: 1690,
    canvasY: 127,
    width: 277,
    height: 346,
  },
  {
    id: "item-1792662270905-joxl4",
    title: "Oversized Sweatshirt Back",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662270209-kk0x-1000919742.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjI3MDIwOS1razB4LTEwMDA5MTk3NDIuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.DkcFanobHBHIHxRBaSCb_AGXOJAtQMTZQisIpvILSjjal5-RCywIiWI8QboNwrS3Yrt32EKf-aRRD7I3uAXjRA",
    canvasX: 2882,
    canvasY: 1568,
    width: 274,
    height: 352,
  },
  {
    id: "item-1792662249792-y9nu7",
    title: "Oversized Hoodie Back",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662248956-nxnt-1000919743.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjI0ODk1Ni1ueG50LTEwMDA5MTk3NDMuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ._Prtn4NQs9QX0uc1WL603Ed-oNTYihjzUryoE8AmZ5ecRWxGErQjpflmnrA_5cWRe2LVl7BpGDgZe-mYWXDpfA",
    canvasX: 797,
    canvasY: 1640,
    width: 274,
    height: 352,
  },
  {
    id: "item-1792662230719-510oq",
    title: "Oversized Tee Back",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662229739-cfux-1000919744.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjIyOTczOS1jZnV4LTEwMDA5MTk3NDQuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.5bkuQZu8xzv3RphqW2Wjikt_0PI2e4oW1UGv9yy2VHAaygK2fHGaMoj0Y_XHS1gv6xUzynzw_w4VPbItT1wP2A",
    canvasX: 2298,
    canvasY: 2270,
    width: 274,
    height: 352,
  },
  {
    id: "item-1792662211263-u55ze",
    title: "Acidwash Tee Back",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662210454-9t9p-1000919745.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjIxMDQ1NC05dDlwLTEwMDA5MTk3NDUuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.z7bRlmCwT2snpPp1uSRm2dpmPVEMz3kOnvqqhT2jrTreBz1NLmbTZPGlevBf9g_z7OX-pi31pP4d2_WCzmmD-A",
    canvasX: 1736,
    canvasY: 2335,
    width: 274,
    height: 352,
  },
  {
    id: "item-1792662188658-jlkz7",
    title: "Zip-Hoodie Back",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662187744-lw2h-1000919746.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjE4Nzc0NC1sdzJoLTEwMDA5MTk3NDYuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MCwiZXhwIjoyMTA4MDQyMTQwfQ.0A_pQxzT37k0HyIFawdDhoMjfY7GnHPmMdLRYMyEN-wocbg_K0GQfHKyPMZmLvafmrPCchbpAxFXX3OtL339Ug",
    canvasX: 2279,
    canvasY: 326,
    width: 274,
    height: 352,
  },
  {
    id: "item-1792662126566-z0cso",
    title: "Gadget Store Logo",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662113881-sa61-1000919752.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjExMzg4MS1zYTYxLTEwMDA5MTk3NTIucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MCwiZXhwIjoyMTA4MDQyMTQwfQ.Al1rz5soVsvDSpIOZrle1jW_1cAM-NIuGTqbHGPylXHGtCrA4BLalzkbIUe_6oDRuY-li0e5vJKKwl0JqYc1ZA",
    canvasX: 2773,
    canvasY: 2025,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792662089067-h61xa",
    title: "Personal Brand Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662087294-f8c8-1000919753.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjA4NzI5NC1mOGM4LTEwMDA5MTk3NTMucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjIzMSwiZXhwIjoyMTA4MDQyMjMxfQ.5DX45CJa1ukfMif0QqrKKMW5RrCuq-o-BuD2-CUOpi0NQOhReeStOtg5gfpNaj1rfOrUV6_jhP7K4WOGcVDXrQ",
    canvasX: 1257,
    canvasY: 2397,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792662063542-pjgze",
    title: "Clothing Store Logo",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792662062834-z53w-1000919755.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MjA2MjgzNC16NTN3LTEwMDA5MTk3NTUuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.cNL_zyal4PyUHYJM4OCB43DcuMEP0758LgwiOncTotm1MJHNJSry3Ib5ctJN9fKgfvITVgOhPosI0KvKgoTCYQ",
    canvasX: 626,
    canvasY: 1038,
    width: 301,
    height: 319,
  },
  {
    id: "item-1792662034272-g3tnz",
    title: "Clipbot Logo",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661962252-8w2h-1000919756.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTk2MjI1Mi04dzJoLTEwMDA5MTk3NTYuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.2zdtGx-lzMdbAGW2gZ9TgtyX9jlwebrmBwUsx8MwtHvOjs8Vhg9uMhZfs7WLN168qWk28Tc9HD4Lv0O-tIl8zA",
    canvasX: 757,
    canvasY: 2134,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661940037-jf21b",
    title: "Discord Server Logo",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661939271-r9s5-1000919757.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTkzOTI3MS1yOXM1LTEwMDA5MTk3NTcucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.GZp4MoD5jNxVk_VZ5dv2khEs_hana8KL32QAXXhTahUU7S9E-l58wbMh4LcuIUHAjT85XfU-0EJ2Yr0SVbNn9A",
    canvasX: 3229,
    canvasY: 1334,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661922141-8pq7n",
    title: "Discord Server Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661920490-vl6r-1000919758.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTkyMDQ5MC12bDZyLTEwMDA5MTk3NTgucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MCwiZXhwIjoyMTA4MDQyMTQwfQ.cj-iHWX-ref_oxaxNZk79ZOw_jKY9TK6WcNdUBFEE82naVnsBsUrZkbJlI7RBfVcRDVe2CbO72HesfwtlKWjiw",
    canvasX: 1294,
    canvasY: 80,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661901323-eooet",
    title: "Discord Server Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661900255-k1tl-1000919759.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTkwMDI1NS1rMXRsLTEwMDA5MTk3NTkucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.dJvIiS4BbBJtKqGNkL-CJAxqCpEAzAq6Bn3xr6jpPhUEOmVNzMWEGiceIfcxq8LjD69jmdgcsz9IMh4kslXRfQ",
    canvasX: 2448,
    canvasY: 2696,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661884845-usaot",
    title: "SaaS Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661883031-l4yx-1000919760.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTg4MzAzMS1sNHl4LTEwMDA5MTk3NjAuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.tkGfpytIgAAlo4HpMhLbZ0NosJCrtJqLqftKw7BaiSsfB9m_NqTlXVRHDqDDibLEOK-rdadXT8GJ8VsXdLGr_A",
    canvasX: 3226,
    canvasY: 1736,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661859719-ysjpe",
    title: "Minecraft Youtube Channel Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661857479-nx6o-1000919761.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTg1NzQ3OS1ueDZvLTEwMDA5MTk3NjEucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.6HRS10JEeFQ5M3orblMv2foPRByWXkfM8SgitcVrkU-K2z9m99wm4a24mySeXzioPBm19oV3qFcOK2Iqw5wRGA",
    canvasX: 667,
    canvasY: 572,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661838783-4ifni",
    title: "Gadget Store Logo",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661836637-uic5-1000919762.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTgzNjYzNy11aWM1LTEwMDA5MTk3NjIucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.Ut-s1P68ijwDUHp8p-BIwIz2UGfjrKo2WUVFUdWRXZ5We6BVUWRZ0k7mXeuV_n1KMRJLgbBrkjOYnn4ZKxuXmg",
    canvasX: 1836,
    canvasY: 2766,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661818759-f80i4",
    title: "Gadget Store Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661817922-mibv-1000919763.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTgxNzkyMi1taWJ2LTEwMDA5MTk3NjMucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.bfGUA9ZDqXELOXIXIT5v0IDcuzYyOJP0AEeKPXBIJLLA3HyaH8y_55tZbgfdo2-NJAg1PKDE70Yp7hR6zGfe1g",
    canvasX: 639,
    canvasY: 189,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661800877-bkw8k",
    title: "SaaS Logo",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661800306-4apb-1000919764.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTgwMDMwNi00YXBiLTEwMDA5MTk3NjQucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.WG_M9BpPkUkMI91nooSeO7yebXDMO-EkaBJg9heiCMeYlhMS6-2LT_TscuvNEAm5aSBcp-1OH8gLsgd9rrgkjA",
    canvasX: 2636,
    canvasY: 292,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661781161-rsl5x",
    title: "Design Studio Logo",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661778751-zm55-1000919765.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTc3ODc1MS16bTU1LTEwMDA5MTk3NjUucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.vs2sAote80RSCRINJRfaLyFZlKpmX-R60kGV_JkEdsyCqw24xwPctPsS93s2aMLAcjLRb_C2s92t7K7JatHqHA",
    canvasX: 2860,
    canvasY: 2406,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661762128-jz970",
    title: "Streetwear Clothing Brand Logo",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661760872-n2n9-1000919766.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTc2MDg3Mi1uMm45LTEwMDA5MTk3NjYucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.RV_NsiS4jwKWFc0NruZIhxhttC_DzAeOUA6DtqJxgCe5HtX0lINeTQysD6GYzfz0GZOEhPxwPI3NK30IA7JSSw",
    canvasX: 3141,
    canvasY: 883,
    width: 310,
    height: 310,
  },
  {
    id: "item-1792661740208-w8r65",
    title: "Hardware Shop Flyer",
    description: "",
    year: "2024",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661738257-gu1y-1000919767.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTczODI1Ny1ndTF5LTEwMDA5MTk3NjcucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.90MhTfYDZHFMKUmA7QdS3LH0rXOsLceObi2vff9u1qmgR3GsVRb62gBatrFyM1yBwYzvOi73Vs5Ew6uk1t-G_A",
    canvasX: 420,
    canvasY: 1704,
    width: 272,
    height: 352,
  },
  {
    id: "item-1792661721957-ncdrm",
    title: "Decorative Poster",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661718894-783m-1000919770.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTcxODg5NC03ODNtLTEwMDA5MTk3NzAucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4NjQ2MywiZXhwIjoyMTA4MDQ2NDYzfQ.Qql80YSjJSmWGImnpntBJoAk3okM6P9eV2bv8a_ty5C0blV1GYDNdg1ze4UG30L5BQ4rPI2hjUuDdlpQszBTYQ",
    canvasX: 278,
    canvasY: 671,
    width: 261,
    height: 369,
  },
  {
    id: "item-1792661700714-zsc0f",
    title: "Political Campaign",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661698633-ww62-1000919772.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTY5ODYzMy13dzYyLTEwMDA5MTk3NzIucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.oPyoa5ZZqlDk67u87Wc9C3bAK8bPik_U4aLkN53XUaar0PDPsyDrmvnseqodaOBoabTXEAlRZ0JoX4j7Hfi1hw",
    canvasX: 3139,
    canvasY: 462,
    width: 277,
    height: 346,
  },
  {
    id: "item-1792661678917-ed4bj",
    title: "Burger Seer Ad",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661674405-o2pb-1000919773.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTY3NDQwNS1vMnBiLTEwMDA5MTk3NzMucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4NjQ2NiwiZXhwIjoyMTA4MDQ2NDY2fQ.w90d3W9PXCw-t165J_1HDI3fo5M76i8jxSMoQ6tF5PtZptBCZkltkkL0qbwk6nGtW8e7iZaQ2uwy-HZ6AdHtIw",
    canvasX: 80,
    canvasY: 1550,
    width: 268,
    height: 357,
  },
  {
    id: "item-1792661655396-92ydq",
    title: "Instagram Teaser Post",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661652387-bux5-1000919774.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTY1MjM4Ny1idXg1LTEwMDA5MTk3NzQucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4NjQ2OCwiZXhwIjoyMTA4MDQ2NDY4fQ.rhmK2b-DNj6Gj5XZJkxkcmCnv-GCHIEOfxXYMLgDzYB2EjrrcOpIOQvwFnsbOaVWhKsSFGhkeNDl5u04fBiCnA",
    canvasX: 3615,
    canvasY: 1145,
    width: 277,
    height: 346,
  },
  {
    id: "item-1792661632931-myi9s",
    title: "Instagram Comparison Post",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661628009-8h1v-1000919775.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTYyODAwOS04aDF2LTEwMDA5MTk3NzUucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4NjQ2OSwiZXhwIjoyMTA4MDQ2NDY5fQ.zBrqxGBvqTnj4LNkIjzftFi0DhMveKNtJ-PoqvgA2D5CUQRo7TCldduUBj8Xp4Enk383fEbZDv11IVfA93bwaw",
    canvasX: 1480,
    canvasY: 2790,
    width: 277,
    height: 346,
  },
  {
    id: "item-1792661601315-m7inm",
    title: "Youtube Learning Photoshop Thumbnail",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661596254-uffi-1000919778.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTU5NjI1NC11ZmZpLTEwMDA5MTk3NzgucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4NjQ3MywiZXhwIjoyMTA4MDQ2NDczfQ.bAA61yZheDKf-gWYZPrtBhn9Wx845Tv9wpYmnKm2a25eD9GdLYCTkjw3uX-qvYOvJq9wogbeTne9aCsptmQ_Cw",
    canvasX: 114,
    canvasY: 1223,
    width: 413,
    height: 232,
  },
  {
    id: "item-1792661573004-3hpym",
    title: "Youtube Minecraft Thumbnail",
    description: "",
    year: "2025",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661571747-0g4c-1000919779.jpg?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTU3MTc0Ny0wZzRjLTEwMDA5MTk3NzkuanBnIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MCwiZXhwIjoyMTA4MDQyMTQwfQ.SpYGhwH6LLXSnv9_dG2dbIY5hCTK258cQoewC9JlAUi7SZkmzft2VfwSHTRacOcZf92Gk-sUFNjAp7Oc3ejkEQ",
    canvasX: 3048,
    canvasY: 80,
    width: 413,
    height: 233,
  },
  {
    id: "item-1792661307244-evxaw",
    title: "Youtube Podcast Thumbnail",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661303061-qezl-1000919780.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTMwMzA2MS1xZXpsLTEwMDA5MTk3ODAucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4NjQ3NiwiZXhwIjoyMTA4MDQ2NDc2fQ.EvCqcc8yTCzoVP_L6y08A8AANrPJW8zEb3RXjWX4mXnum_cKYtHD4qQ72oHOF9JMoP_1wS72C6NRXYnNNo-qWg",
    canvasX: 3486,
    canvasY: 482,
    width: 413,
    height: 232,
  },
  {
    id: "item-1792661268529-wrlwr",
    title: "Youtube Lifestyle Thumbnail",
    description: "",
    year: "2026",
    mediaType: "image",
    imageUrl:
      "https://jnolhqtsuyfckytngssa.supabase.co/storage/v1/object/sign/contact-attachments/inquiries/cms-1792661266340-51m7-1000919781.png?token=eyJraWQiOiIzZDhmODFiZi1hZDA3LTQ3MTAtYjBmYi05YWNmNjNkYzUxMjkiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJjb250YWN0LWF0dGFjaG1lbnRzL2lucXVpcmllcy9jbXMtMTc5MjY2MTI2NjM0MC01MW03LTEwMDA5MTk3ODEucG5nIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc5MjY4MjE0MSwiZXhwIjoyMTA4MDQyMTQxfQ.nWxSuIoLQpG-7gyqhskRmKMN6TMdtPGkj3w2_JnED3cxN0Sl7ScJBjQ6oxXS3L7sWbO3d8pwWBJFwKDVnD-xvw",
    canvasX: 828,
    canvasY: 2822,
    width: 413,
    height: 232,
  },
];
