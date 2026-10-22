import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trash2,
  Volume2,
  X,
  ZoomIn,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  InteractiveVideo,
  isVideoSource,
  MediaImage,
  SilentAutoPlayVideo,
} from "@/components/MediaImage";
import { Reveal } from "@/components/Reveal";
import {
  CANVAS_DIMENSIONS,
  computeAspectDimensions,
  expandCanvasProjects,
  type PortfolioCanvasProject,
} from "@/data/portfolioProjects";
import {
  buildResolvedCanvasItemsFromStore,
  loadSynchronizedCmsState,
  mutateAddCanvasItems,
  mutateDeleteCanvasItem,
  mutateRandomizeCanvasItemPosition,
  readLocalCmsStore,
  uploadMediaFilesToCms,
} from "@/lib/cms-storage";

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.2;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function resolveProjectVideoUrl(project: PortfolioCanvasProject): string | undefined {
  if (project.videoUrl) return project.videoUrl;
  if (isVideoSource(project.imageUrl)) return project.imageUrl;
  return undefined;
}

function isProjectVideo(project: PortfolioCanvasProject): boolean {
  return project.mediaType === "video" || Boolean(resolveProjectVideoUrl(project));
}

function computeItemsSignature(items: PortfolioCanvasProject[]): string {
  let sig = `${items.length}:`;
  for (let i = 0; i < items.length; i += 1) {
    const p = items[i];
    const extrasSig = p.extraMedia
      ? p.extraMedia.map((m) => `${m.id}@${m.canvasX},${m.canvasY},${m.imageUrl}`).join("|")
      : "";
    sig += `${p.id}@${p.canvasX},${p.canvasY},${p.width},${p.height},${p.title},${p.mediaType ?? ""},${p.imageUrl},${p.videoUrl ?? ""},[${extrasSig}];`;
  }
  return sig;
}

interface CanvasProjectCardProps {
  project: PortfolioCanvasProject;
  isHighlighted: boolean;
  embeddedPreview: boolean;
  onCardClick: (project: PortfolioCanvasProject) => void;
  onCardKeyDown: (event: ReactKeyboardEvent<HTMLElement>, project: PortfolioCanvasProject) => void;
  onRegisterAspect: (projectId: string, naturalWidth: number, naturalHeight: number) => void;
  onRandomizeItem: (project: PortfolioCanvasProject) => void;
  onDeleteItem: (project: PortfolioCanvasProject) => void;
}

const CanvasProjectCard = memo(function CanvasProjectCard({
  project,
  isHighlighted,
  embeddedPreview,
  onCardClick,
  onCardKeyDown,
  onRegisterAspect,
  onRandomizeItem,
  onDeleteItem,
}: CanvasProjectCardProps) {
  const videoSrc = resolveProjectVideoUrl(project);
  const isVideo = isProjectVideo(project);

  return (
    <article
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={{
        left: `${project.canvasX}px`,
        top: `${project.canvasY}px`,
        width: `${project.width}px`,
        height: `${project.height}px`,
      }}
      onClick={() => onCardClick(project)}
      onKeyDown={(e) => onCardKeyDown(e, project)}
      tabIndex={0}
      role="button"
      aria-label={
        isVideo
          ? `${project.title} — Click to play video with sound`
          : `${project.title} — Click to open zoomable photo preview`
      }
      className={`canvas-card-surface group absolute select-none text-left focus-visible:outline-none ${
        isHighlighted ? "z-30" : "z-10"
      }`}
    >
      {/* Crisp Media Frame preserving 100% original aspect ratio */}
      <div
        style={{
          width: `${project.width}px`,
          height: `${project.height}px`,
          aspectRatio: `${project.width} / ${project.height}`,
        }}
        className={`relative h-full w-full overflow-hidden rounded-2xl border bg-neutral-950 transition-colors duration-200 group-hover:border-white/35 group-focus-visible:ring-2 group-focus-visible:ring-white/80 ${
          isHighlighted
            ? "border-emerald-400/90 ring-4 ring-emerald-400/35 shadow-2xl"
            : "border-white/12 shadow-xl"
        }`}
      >
        {videoSrc ? (
          <SilentAutoPlayVideo
            src={videoSrc}
            poster={
              project.imageUrl && !isVideoSource(project.imageUrl) ? project.imageUrl : undefined
            }
            alt={project.title}
            width={project.width}
            height={project.height}
            preload="metadata"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth > 0 && v.videoHeight > 0) {
                onRegisterAspect(project.id, v.videoWidth, v.videoHeight);
              }
            }}
            className="pointer-events-none block h-full w-full rounded-2xl object-cover"
          />
        ) : (
          <MediaImage
            src={project.imageUrl}
            alt={project.title}
            width={project.width}
            height={project.height}
            loading="eager"
            decoding="sync"
            maxRenderDimension={720}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                onRegisterAspect(project.id, img.naturalWidth, img.naturalHeight);
              }
            }}
            className="pointer-events-none block h-full w-full rounded-2xl object-cover"
          />
        )}

        {/* Quick CMS Controls on Canvas Cards when inside Studio CMS Embedded Preview */}
        {embeddedPreview && (
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-2.5 top-2.5 z-30 flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRandomizeItem(project);
              }}
              title="Random Place on Canvas"
              className="liquid-glass inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[0.65rem] font-medium text-foreground transition-colors hover:bg-white/20"
            >
              <Shuffle className="h-3 w-3" />
              <span>Random</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteItem(project);
              }}
              title="Delete from Canvas"
              className="liquid-glass flex h-8 w-8 items-center justify-center rounded-full text-red-300 transition-colors hover:bg-red-500/80 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Subtle Video Sound Hint Pill on Top-Right */}
        {isVideo && (
          <div className="pointer-events-none absolute right-3 top-3 z-20">
            <div className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.62rem] font-medium tracking-wider text-foreground opacity-85 transition-opacity group-hover:opacity-100">
              <Volume2 className="h-3 w-3 text-foreground/90" />
              <span>Click for Sound</span>
            </div>
          </div>
        )}

        {/* Restrained Liquid-Glass Hover / Focus Action Bar */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <div className="liquid-glass flex items-center justify-between gap-2 rounded-xl px-3.5 py-2">
            <span className="truncate text-[0.7rem] font-medium text-foreground">
              {isVideo ? "Play with sound" : "Preview & zoom"}
            </span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-foreground">
              {isVideo ? <Volume2 className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
});

export interface ShowcaseProps {
  embeddedPreview?: boolean;
  onRequestDeleteItem?: (project: PortfolioCanvasProject) => void;
}

export function Showcase({ embeddedPreview = false, onRequestDeleteItem }: ShowcaseProps = {}) {
  const prefersReducedMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const photoStageRef = useRef<HTMLDivElement>(null);
  const zoomReadoutRef = useRef<HTMLSpanElement>(null);
  const lastZoomPercentRef = useRef<number>(embeddedPreview ? 62 : 78);

  // Hardware-accelerated 120fps camera state (lives in refs so panning/zooming never re-renders React)
  // Initialized deterministically so SSR HTML and client hydration match 100%; mount effect centers to real viewport.
  const initialWidth = 1200;
  const initialHeight = embeddedPreview ? 480 : 670;
  const initialScale = embeddedPreview ? 0.62 : 0.78;
  const initialX = Math.round(initialWidth / 2 - CANVAS_DIMENSIONS.initialFocusX * initialScale);
  const initialY = Math.round(initialHeight / 2 - CANVAS_DIMENSIONS.initialFocusY * initialScale);

  const camRef = useRef({
    x: initialX,
    y: initialY,
    scale: initialScale,
    targetX: initialX,
    targetY: initialY,
    targetScale: initialScale,
    vx: 0,
    vy: 0,
    mode: "idle" as "idle" | "dragging" | "inertia" | "smooth" | "tween",
    tweenStartX: 0,
    tweenStartY: 0,
    tweenStartScale: initialScale,
    tweenStartTime: 0,
    tweenDuration: 0,
    rafId: 0,
  });

  // Active pointer tracking for 1:1 drag + 2-finger pinch zoom
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragSessionRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    movedBeyondThreshold: boolean;
    pinchDist: number;
    pinchMidX: number;
    pinchMidY: number;
  } | null>(null);
  const suppressNextCardClickRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [cmsItems, setCmsItems] = useState<PortfolioCanvasProject[]>([]);
  const lastSignatureRef = useRef<string>(computeItemsSignature([]));

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCmsItemsIfChanged = useCallback((nextItems: PortfolioCanvasProject[]) => {
    const nextSig = computeItemsSignature(nextItems);
    if (nextSig !== lastSignatureRef.current) {
      lastSignatureRef.current = nextSig;
      setCmsItems(nextItems);
    }
  }, []);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [measuredDimensions, setMeasuredDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const measuredDimensionsRef = useRef(measuredDimensions);
  measuredDimensionsRef.current = measuredDimensions;
  const pendingDimensionsRef = useRef<Record<string, { width: number; height: number }>>({});
  const aspectRafRef = useRef<number | null>(null);

  const [selectedProject, setSelectedProject] = useState<PortfolioCanvasProject | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);

  // Interactive Photo Preview Zoom & Pan State
  const [photoScale, setPhotoScale] = useState(1);
  const [photoPan, setPhotoPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningPhoto, setIsPanningPhoto] = useState(false);
  const photoPanStartRef = useRef<{
    clientX: number;
    clientY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const highlightTimeoutRef = useRef<number | null>(null);

  const applyCameraTransform = useCallback((x: number, y: number, scale: number) => {
    const stage = stageRef.current;
    if (stage) {
      stage.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    }
    const nextPercent = Math.round(scale * 100);
    if (lastZoomPercentRef.current !== nextPercent) {
      lastZoomPercentRef.current = nextPercent;
      const node = zoomReadoutRef.current;
      if (node) {
        node.textContent = `${nextPercent}%`;
        node.setAttribute("aria-label", `Current zoom level ${nextPercent} percent`);
      }
    }
  }, []);

  const startCameraLoop = useCallback(() => {
    const cam = camRef.current;
    if (cam.rafId) return;

    const tick = (now: number) => {
      cam.rafId = 0;

      if (cam.mode === "dragging") {
        applyCameraTransform(cam.x, cam.y, cam.scale);
        return;
      }

      if (cam.mode === "tween") {
        const elapsed = now - cam.tweenStartTime;
        const t = cam.tweenDuration <= 0 ? 1 : Math.min(1, elapsed / cam.tweenDuration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        cam.x = cam.tweenStartX + (cam.targetX - cam.tweenStartX) * eased;
        cam.y = cam.tweenStartY + (cam.targetY - cam.tweenStartY) * eased;
        cam.scale = cam.tweenStartScale + (cam.targetScale - cam.tweenStartScale) * eased;
        applyCameraTransform(cam.x, cam.y, cam.scale);

        if (t < 1) {
          cam.rafId = requestAnimationFrame(tick);
        } else {
          cam.mode = "idle";
          viewportRef.current?.classList.remove("is-panning");
        }
        return;
      }

      if (cam.mode === "smooth") {
        const lerp = 0.28;
        const dx = cam.targetX - cam.x;
        const dy = cam.targetY - cam.y;
        const ds = cam.targetScale - cam.scale;

        if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15 && Math.abs(ds) < 0.0005) {
          cam.x = cam.targetX;
          cam.y = cam.targetY;
          cam.scale = cam.targetScale;
          applyCameraTransform(cam.x, cam.y, cam.scale);
          cam.mode = "idle";
          viewportRef.current?.classList.remove("is-panning");
          return;
        }

        cam.x += dx * lerp;
        cam.y += dy * lerp;
        cam.scale += ds * lerp;
        applyCameraTransform(cam.x, cam.y, cam.scale);
        cam.rafId = requestAnimationFrame(tick);
        return;
      }

      if (cam.mode === "inertia") {
        cam.x += cam.vx;
        cam.y += cam.vy;
        cam.targetX = cam.x;
        cam.targetY = cam.y;
        cam.vx *= 0.91;
        cam.vy *= 0.91;
        applyCameraTransform(cam.x, cam.y, cam.scale);

        if (Math.hypot(cam.vx, cam.vy) > 0.35) {
          cam.rafId = requestAnimationFrame(tick);
        } else {
          cam.vx = 0;
          cam.vy = 0;
          cam.mode = "idle";
          viewportRef.current?.classList.remove("is-panning");
        }
      }
    };

    cam.rafId = requestAnimationFrame(tick);
  }, [applyCameraTransform]);

  useEffect(() => {
    const cam = camRef.current;
    return () => {
      if (cam.rafId) {
        cancelAnimationFrame(cam.rafId);
      }
    };
  }, []);

  const allProjects = useMemo(() => {
    const expanded = expandCanvasProjects(cmsItems);
    if (Object.keys(measuredDimensions).length === 0) {
      return expanded;
    }
    return expanded.map((project) => {
      const override = measuredDimensions[project.id];
      if (!override) return project;
      return {
        ...project,
        width: override.width,
        height: override.height,
      };
    });
  }, [cmsItems, measuredDimensions]);

  const allProjectsRef = useRef<PortfolioCanvasProject[]>(allProjects);
  allProjectsRef.current = allProjects;

  const canvasBounds = useMemo(() => {
    let maxRight: number = CANVAS_DIMENSIONS.width;
    let maxBottom: number = CANVAS_DIMENSIONS.height;
    for (const p of allProjects) {
      maxRight = Math.max(maxRight, p.canvasX + p.width + 200);
      maxBottom = Math.max(maxBottom, p.canvasY + p.height + 200);
    }
    return { width: maxRight, height: maxBottom };
  }, [allProjects]);

  const photoZoomPercent = Math.round(photoScale * 100);

  const registerNaturalAspect = useCallback(
    (projectId: string, naturalWidth: number, naturalHeight: number) => {
      if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) return;
      const { width, height } = computeAspectDimensions(naturalWidth, naturalHeight, 310);

      const currentCard = allProjectsRef.current.find((p) => p.id === projectId);
      if (currentCard) {
        const currentRatio = currentCard.width / Math.max(1, currentCard.height);
        const naturalRatio = naturalWidth / naturalHeight;
        // If stored card dimensions already match the natural aspect ratio closely, keep them locked
        if (
          Math.abs(currentRatio - naturalRatio) <= 0.06 ||
          (Math.abs(currentCard.width - width) <= 4 && Math.abs(currentCard.height - height) <= 4)
        ) {
          return;
        }
      }

      const existing =
        pendingDimensionsRef.current[projectId] ?? measuredDimensionsRef.current[projectId];
      if (
        existing &&
        Math.abs(existing.width - width) <= 4 &&
        Math.abs(existing.height - height) <= 4
      ) {
        return;
      }

      pendingDimensionsRef.current[projectId] = { width, height };
      if (aspectRafRef.current === null && typeof window !== "undefined") {
        aspectRafRef.current = window.requestAnimationFrame(() => {
          aspectRafRef.current = null;
          const batch = pendingDimensionsRef.current;
          pendingDimensionsRef.current = {};
          if (Object.keys(batch).length > 0) {
            setMeasuredDimensions((prev) => ({ ...prev, ...batch }));
          }
        });
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (aspectRafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(aspectRafRef.current);
      }
    };
  }, []);

  const focusCanvasPoint = useCallback(
    (canvasX: number, canvasY: number, targetScale?: number, durationMs = 520) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const vpWidth =
        rect.width > 0
          ? rect.width
          : typeof window !== "undefined"
            ? Math.max(320, Math.min(1280, window.innerWidth - 48))
            : 1200;
      const vpHeight = rect.height > 0 ? rect.height : embeddedPreview ? 480 : 670;
      const isMobile = vpWidth < 640;
      const defaultScale = embeddedPreview ? (isMobile ? 0.48 : 0.62) : isMobile ? 0.54 : 0.78;
      const scale = clampScale(targetScale ?? defaultScale);

      const posX = Math.round(vpWidth / 2 - canvasX * scale);
      const posY = Math.round(vpHeight / 2 - canvasY * scale);

      const cam = camRef.current;
      cam.vx = 0;
      cam.vy = 0;

      const animTime = prefersReducedMotion ? 0 : durationMs;
      if (animTime <= 0) {
        cam.x = posX;
        cam.y = posY;
        cam.scale = scale;
        cam.targetX = posX;
        cam.targetY = posY;
        cam.targetScale = scale;
        cam.mode = "idle";
        applyCameraTransform(posX, posY, scale);
      } else {
        cam.tweenStartX = cam.x;
        cam.tweenStartY = cam.y;
        cam.tweenStartScale = cam.scale;
        cam.targetX = posX;
        cam.targetY = posY;
        cam.targetScale = scale;
        cam.tweenStartTime = performance.now();
        cam.tweenDuration = animTime;
        cam.mode = "tween";
        startCameraLoop();
      }
    },
    [applyCameraTransform, embeddedPreview, prefersReducedMotion, startCameraLoop],
  );

  const zoomByStep = useCallback(
    (deltaScale: number, durationMs = 220) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const cam = camRef.current;
      const baseScale = cam.mode === "tween" || cam.mode === "smooth" ? cam.targetScale : cam.scale;
      const baseX = cam.mode === "tween" || cam.mode === "smooth" ? cam.targetX : cam.x;
      const baseY = cam.mode === "tween" || cam.mode === "smooth" ? cam.targetY : cam.y;

      const nextScale = clampScale(baseScale + deltaScale);
      const ratio = nextScale / baseScale;
      const nextX = centerX - (centerX - baseX) * ratio;
      const nextY = centerY - (centerY - baseY) * ratio;

      cam.vx = 0;
      cam.vy = 0;
      if (prefersReducedMotion || durationMs <= 0) {
        cam.x = nextX;
        cam.y = nextY;
        cam.scale = nextScale;
        cam.targetX = nextX;
        cam.targetY = nextY;
        cam.targetScale = nextScale;
        cam.mode = "idle";
        applyCameraTransform(nextX, nextY, nextScale);
      } else {
        viewport.classList.add("is-panning");
        cam.tweenStartX = cam.x;
        cam.tweenStartY = cam.y;
        cam.tweenStartScale = cam.scale;
        cam.targetX = nextX;
        cam.targetY = nextY;
        cam.targetScale = nextScale;
        cam.tweenStartTime = performance.now();
        cam.tweenDuration = durationMs;
        cam.mode = "tween";
        startCameraLoop();
      }
    },
    [applyCameraTransform, prefersReducedMotion, startCameraLoop],
  );

  const computeSmartCanvasFocusPoint = useCallback((): { x: number; y: number } => {
    const projects = allProjectsRef.current;
    if (!projects || projects.length === 0) {
      return {
        x: CANVAS_DIMENSIONS.initialFocusX,
        y: CANVAS_DIMENSIONS.initialFocusY,
      };
    }

    const centers = projects.map((p) => {
      const dims = measuredDimensionsRef.current[p.id] ?? {
        width: p.width,
        height: p.height,
      };
      return {
        id: p.id,
        cx: p.canvasX + dims.width / 2,
        cy: p.canvasY + dims.height / 2,
      };
    });

    if (centers.length === 1) {
      return { x: Math.round(centers[0].cx), y: Math.round(centers[0].cy) };
    }

    const avgX = centers.reduce((acc, c) => acc + c.cx, 0) / centers.length;
    const avgY = centers.reduce((acc, c) => acc + c.cy, 0) / centers.length;

    // Find the card closest to the centroid of all cards so the camera is guaranteed
    // to frame actual media cards near the center of the viewport rather than empty space.
    let best = centers[0];
    let bestDist = Math.hypot(best.cx - avgX, best.cy - avgY);
    for (let i = 1; i < centers.length; i += 1) {
      const d = Math.hypot(centers[i].cx - avgX, centers[i].cy - avgY);
      if (d < bestDist) {
        best = centers[i];
        bestDist = d;
      }
    }

    // Blend slightly toward the cluster average if the nearest card is close to the centroid
    if (bestDist <= 420) {
      return {
        x: Math.round(best.cx * 0.6 + avgX * 0.4),
        y: Math.round(best.cy * 0.6 + avgY * 0.4),
      };
    }

    return { x: Math.round(best.cx), y: Math.round(best.cy) };
  }, []);

  const handleResetView = useCallback(
    (durationMs = 520) => {
      const pt = computeSmartCanvasFocusPoint();
      focusCanvasPoint(pt.x, pt.y, undefined, durationMs);
    },
    [computeSmartCanvasFocusPoint, focusCanvasPoint],
  );

  const pulseHighlight = useCallback((id: string) => {
    setHighlightedId(id);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedId((prev) => (prev === id ? null : prev));
    }, 2400);
  }, []);

  const focusProjectOnCanvas = useCallback(
    (project: PortfolioCanvasProject, durationMs = 550) => {
      const resolved = allProjectsRef.current.find((p) => p.id === project.id) ?? project;
      const dims = measuredDimensionsRef.current[resolved.id] ?? {
        width: resolved.width,
        height: resolved.height,
      };
      const centerX = resolved.canvasX + dims.width / 2;
      const centerY = resolved.canvasY + dims.height / 2;
      const viewport = viewportRef.current;
      const isMobile = viewport ? viewport.clientWidth < 640 : false;
      const targetScale = embeddedPreview ? (isMobile ? 0.56 : 0.74) : isMobile ? 0.68 : 0.9;
      focusCanvasPoint(centerX, centerY, targetScale, durationMs);
      pulseHighlight(resolved.id);
    },
    [embeddedPreview, focusCanvasPoint, pulseHighlight],
  );

  const handleResetViewRef = useRef(handleResetView);
  handleResetViewRef.current = handleResetView;
  const focusProjectOnCanvasRef = useRef(focusProjectOnCanvas);
  focusProjectOnCanvasRef.current = focusProjectOnCanvas;
  const hasCenteredOnLoadedItemsRef = useRef(false);

  const centerOnBestTarget = useCallback((durationMs = 0) => {
    const store = readLocalCmsStore();
    const updatedAgeMs = Date.now() - new Date(store.updatedAt || 0).getTime();
    if (store.lastFocusedId && updatedAgeMs < 120_000) {
      const target = allProjectsRef.current.find((p) => p.id === store.lastFocusedId);
      if (target) {
        focusProjectOnCanvasRef.current(target, durationMs);
        return;
      }
    }
    handleResetViewRef.current(durationMs);
  }, []);

  // Load persisted Canvas CMS items and listen for live updates from the Studio CMS
  useEffect(() => {
    let active = true;
    const initialLocalItems = buildResolvedCanvasItemsFromStore(readLocalCmsStore()).items;
    updateCmsItemsIfChanged(initialLocalItems);

    const applyIncomingItemsAndCenterIfNeeded = (nextItems: PortfolioCanvasProject[]) => {
      const nextSig = computeItemsSignature(nextItems);
      const changed = nextSig !== lastSignatureRef.current;
      updateCmsItemsIfChanged(nextItems);
      if (changed && nextItems.length > 0 && camRef.current.mode !== "dragging") {
        window.setTimeout(() => {
          if (!active || camRef.current.mode === "dragging") return;
          centerOnBestTarget(420);
        }, 40);
      }
    };

    const syncFromServer = () => {
      void loadSynchronizedCmsState()
        .then((res) => {
          if (!active || !res?.items) return;
          applyIncomingItemsAndCenterIfNeeded(res.items);
        })
        .catch(() => {});
    };

    syncFromServer();

    const onCmsUpdated = (event: Event) => {
      const custom = event as CustomEvent<PortfolioCanvasProject[]>;
      if (Array.isArray(custom.detail)) {
        applyIncomingItemsAndCenterIfNeeded(custom.detail);
      } else {
        applyIncomingItemsAndCenterIfNeeded(
          buildResolvedCanvasItemsFromStore(readLocalCmsStore()).items,
        );
      }
    };

    const onServerSynced = (event: Event) => {
      const custom = event as CustomEvent<{ items?: PortfolioCanvasProject[] }>;
      if (Array.isArray(custom.detail?.items)) {
        applyIncomingItemsAndCenterIfNeeded(custom.detail.items);
      }
    };

    const onFocusItem = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string; items?: PortfolioCanvasProject[] }>;
      const targetId = custom.detail?.id;
      if (!targetId) return;
      const list = custom.detail?.items ?? allProjectsRef.current;
      const target = expandCanvasProjects(list).find((p) => p.id === targetId);
      if (target) {
        window.setTimeout(() => {
          focusProjectOnCanvas(target, 520);
        }, 40);
      }
    };

    const onStorage = () => {
      applyIncomingItemsAndCenterIfNeeded(
        buildResolvedCanvasItemsFromStore(readLocalCmsStore()).items,
      );
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        applyIncomingItemsAndCenterIfNeeded(
          buildResolvedCanvasItemsFromStore(readLocalCmsStore()).items,
        );
        syncFromServer();
      }
    };

    window.addEventListener("canvas-cms-updated", onCmsUpdated);
    window.addEventListener("canvas-cms-server-synced", onServerSynced);
    window.addEventListener("canvas-cms-focus-item", onFocusItem);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        syncFromServer();
      }
    }, 2500);

    return () => {
      active = false;
      window.clearInterval(pollInterval);
      window.removeEventListener("canvas-cms-updated", onCmsUpdated);
      window.removeEventListener("canvas-cms-server-synced", onServerSynced);
      window.removeEventListener("canvas-cms-focus-item", onFocusItem);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [centerOnBestTarget, focusProjectOnCanvas, updateCmsItemsIfChanged]);

  // Whenever items first populate on the canvas (from localStorage or cloud sync),
  // immediately center the camera on them so visitors never see an empty canvas.
  useEffect(() => {
    if (allProjects.length > 0 && !hasCenteredOnLoadedItemsRef.current) {
      hasCenteredOnLoadedItemsRef.current = true;
      centerOnBestTarget(0);
    } else if (allProjects.length === 0) {
      hasCenteredOnLoadedItemsRef.current = false;
    }
  }, [allProjects.length, centerOnBestTarget]);

  // Initial camera positioning: center immediately on mount and track layout stabilization
  useEffect(() => {
    centerOnBestTarget(0);

    const timer = window.setTimeout(() => {
      centerOnBestTarget(0);
    }, 60);

    // Also observe viewport resizing (e.g. after initial loader fades)
    const el = viewportRef.current;
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      let settled = false;
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || entry.contentRect.width === 0) return;
        if (!settled) {
          settled = true;
          centerOnBestTarget(0);
        }
      });
      ro.observe(el);
    }

    return () => {
      window.clearTimeout(timer);
      ro?.disconnect();
    };
  }, [centerOnBestTarget]);

  // Smooth cursor-centered wheel & trackpad pinch zooming
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = el.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const cam = camRef.current;
      const baseX = cam.mode === "smooth" || cam.mode === "tween" ? cam.targetX : cam.x;
      const baseY = cam.mode === "smooth" || cam.mode === "tween" ? cam.targetY : cam.y;
      const baseScale = cam.mode === "smooth" || cam.mode === "tween" ? cam.targetScale : cam.scale;

      // Trackpad two-finger pan gesture (when not holding ctrl for pinch-zoom)
      if (!event.ctrlKey && (Math.abs(event.deltaX) > 0 || event.shiftKey)) {
        const dx = event.shiftKey ? -event.deltaY : -event.deltaX;
        const dy = event.shiftKey ? 0 : -event.deltaY;
        el.classList.add("is-panning");
        cam.targetX = baseX + dx;
        cam.targetY = baseY + dy;
        cam.targetScale = baseScale;
        cam.vx = 0;
        cam.vy = 0;
        cam.mode = "smooth";
        startCameraLoop();
        return;
      }

      const rawDelta =
        event.deltaMode === 1
          ? event.deltaY * 28
          : event.deltaMode === 2
            ? event.deltaY * 240
            : event.deltaY;
      const sensitivity = event.ctrlKey ? 0.0045 : 0.0014;
      const zoomFactor = Math.exp(-rawDelta * sensitivity);
      const nextScale = clampScale(baseScale * zoomFactor);

      const ratio = nextScale / baseScale;
      el.classList.add("is-panning");
      cam.targetScale = nextScale;
      cam.targetX = mouseX - (mouseX - baseX) * ratio;
      cam.targetY = mouseY - (mouseY - baseY) * ratio;
      cam.vx = 0;
      cam.vy = 0;
      cam.mode = "smooth";
      startCameraLoop();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [startCameraLoop]);

  // Pointer drag & multi-touch pinch-to-zoom handlers on viewport
  const handleViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const targetEl = event.target as HTMLElement | null;
    if (targetEl?.closest("button, a, input, [role='toolbar']")) return;

    const el = viewportRef.current;
    if (!el) return;

    // Prevent default browser drag and selection behaviors
    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture errors
    }

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const cam = camRef.current;
    cam.vx = 0;
    cam.vy = 0;
    cam.targetX = cam.x;
    cam.targetY = cam.y;
    cam.targetScale = cam.scale;
    cam.mode = "dragging";

    if (pointersRef.current.size === 1) {
      suppressNextCardClickRef.current = false;
      dragSessionRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        movedBeyondThreshold: false,
        pinchDist: 0,
        pinchMidX: 0,
        pinchMidY: 0,
      };
      el.classList.remove("cursor-grab");
      el.classList.add("cursor-grabbing");
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      suppressNextCardClickRef.current = true;
      el.classList.add("is-panning");
      if (dragSessionRef.current) {
        dragSessionRef.current.movedBeyondThreshold = true;
        dragSessionRef.current.pinchDist = dist;
        dragSessionRef.current.pinchMidX = midX;
        dragSessionRef.current.pinchMidY = midY;
      }
    }
  }, []);

  const handleViewportPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // If mouse button was released outside viewport or without firing pointerup
      if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
        pointersRef.current.delete(event.pointerId);
        dragSessionRef.current = null;
        const el = viewportRef.current;
        if (el) {
          el.classList.remove("cursor-grabbing", "is-panning");
          el.classList.add("cursor-grab");
        }
        if (camRef.current.mode === "dragging") {
          camRef.current.mode = "idle";
        }
        return;
      }

      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const session = dragSessionRef.current;
      const el = viewportRef.current;
      if (!session || !el) return;

      const cam = camRef.current;

      if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;

        if (session.pinchDist > 0) {
          const rect = el.getBoundingClientRect();
          const localMidX = midX - rect.left;
          const localMidY = midY - rect.top;
          const nextScale = clampScale(cam.scale * (dist / session.pinchDist));
          const ratio = nextScale / cam.scale;

          cam.x = localMidX - (localMidX - cam.x) * ratio + (midX - session.pinchMidX);
          cam.y = localMidY - (localMidY - cam.y) * ratio + (midY - session.pinchMidY);
          cam.scale = nextScale;
          cam.targetX = cam.x;
          cam.targetY = cam.y;
          cam.targetScale = cam.scale;
          startCameraLoop();
        }

        session.pinchDist = dist;
        session.pinchMidX = midX;
        session.pinchMidY = midY;
        return;
      }

      const now = performance.now();
      const dx = event.clientX - session.lastX;
      const dy = event.clientY - session.lastY;
      const dt = Math.max(1, now - session.lastTime);

      if (!session.movedBeyondThreshold) {
        const totalMove = Math.hypot(
          event.clientX - session.startX,
          event.clientY - session.startY,
        );
        if (totalMove > 8) {
          session.movedBeyondThreshold = true;
          suppressNextCardClickRef.current = true;
          el.classList.add("is-panning");
        }
      }

      if (session.movedBeyondThreshold) {
        cam.x += dx;
        cam.y += dy;
        cam.targetX = cam.x;
        cam.targetY = cam.y;

        const instVx = (dx / dt) * 16;
        const instVy = (dy / dt) * 16;
        cam.vx = cam.vx * 0.45 + instVx * 0.55;
        cam.vy = cam.vy * 0.45 + instVy * 0.55;

        session.lastX = event.clientX;
        session.lastY = event.clientY;
        session.lastTime = now;
        startCameraLoop();
      }
    },
    [startCameraLoop],
  );

  const handleViewportPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      const el = viewportRef.current;
      if (el && el.hasPointerCapture(event.pointerId)) {
        try {
          el.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
      }

      if (pointersRef.current.size === 0) {
        if (el) {
          el.classList.remove("cursor-grabbing");
          el.classList.add("cursor-grab");
        }
        const session = dragSessionRef.current;
        dragSessionRef.current = null;

        const cam = camRef.current;
        if (session?.movedBeyondThreshold) {
          const idleTime = performance.now() - session.lastTime;
          if (idleTime < 65 && Math.hypot(cam.vx, cam.vy) > 0.8) {
            cam.mode = "inertia";
            startCameraLoop();
          } else {
            cam.vx = 0;
            cam.vy = 0;
            cam.mode = "idle";
            if (el) el.classList.remove("is-panning");
          }
        } else {
          cam.mode = "idle";
          if (el) el.classList.remove("is-panning");
        }
      } else if (pointersRef.current.size === 1 && dragSessionRef.current) {
        const remaining = Array.from(pointersRef.current.values())[0];
        dragSessionRef.current.lastX = remaining.x;
        dragSessionRef.current.lastY = remaining.y;
        dragSessionRef.current.lastTime = performance.now();
        dragSessionRef.current.pinchDist = 0;
      }
    },
    [startCameraLoop],
  );

  // Global window pointer release listener so pointer state never gets orphaned on blur or outside release
  useEffect(() => {
    const handleGlobalRelease = () => {
      pointersRef.current.clear();
      dragSessionRef.current = null;
      const el = viewportRef.current;
      if (el) {
        el.classList.remove("cursor-grabbing", "is-panning");
        el.classList.add("cursor-grab");
      }
      if (camRef.current.mode === "dragging") {
        camRef.current.mode = "idle";
      }
    };

    window.addEventListener("pointerup", handleGlobalRelease);
    window.addEventListener("pointercancel", handleGlobalRelease);
    window.addEventListener("blur", handleGlobalRelease);
    return () => {
      window.removeEventListener("pointerup", handleGlobalRelease);
      window.removeEventListener("pointercancel", handleGlobalRelease);
      window.removeEventListener("blur", handleGlobalRelease);
    };
  }, []);

  const resetPhotoTransform = useCallback(() => {
    setPhotoScale(1);
    setPhotoPan({ x: 0, y: 0 });
    setIsPanningPhoto(false);
    photoPanStartRef.current = null;
  }, []);

  const adjustPhotoZoom = useCallback((delta: number) => {
    setPhotoScale((prev) => {
      const next = Math.min(5, Math.max(0.5, Number((prev + delta).toFixed(2))));
      if (next <= 1) {
        setPhotoPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const el = photoStageRef.current;
    if (!el || !selectedProject) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY < 0 ? 0.2 : -0.2;
      adjustPhotoZoom(delta);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [selectedProject, adjustPhotoZoom]);

  const openProjectModal = useCallback(
    (project: PortfolioCanvasProject) => {
      setSelectedProject(project);
      resetPhotoTransform();
      setVideoError(false);
    },
    [resetPhotoTransform],
  );

  const closeProjectModal = useCallback(() => {
    setSelectedProject(null);
    resetPhotoTransform();
    setVideoError(false);
  }, [resetPhotoTransform]);

  useEffect(() => {
    if (!selectedProject) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeProjectModal();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const currentIndex = allProjects.findIndex((p) => p.id === selectedProject.id);
        const nextProject = allProjects[(currentIndex + 1) % allProjects.length];
        if (nextProject) openProjectModal(nextProject);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        const currentIndex = allProjects.findIndex((p) => p.id === selectedProject.id);
        const prevProject =
          allProjects[(currentIndex - 1 + allProjects.length) % allProjects.length];
        if (prevProject) openProjectModal(prevProject);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjustPhotoZoom(0.3);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        adjustPhotoZoom(-0.3);
      } else if (event.key === "0") {
        event.preventDefault();
        resetPhotoTransform();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedProject,
    allProjects,
    closeProjectModal,
    openProjectModal,
    adjustPhotoZoom,
    resetPhotoTransform,
  ]);

  /**
   * Handles dropping image or video files directly onto the canvas:
   * reads their natural original aspect ratio, uploads to the CMS, and places them randomly without overlap.
   */
  const handleFilesAddedToCanvas = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList).filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        return (
          file.type.startsWith("image/") ||
          file.type.startsWith("video/") ||
          [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "svg",
            "avif",
            "mp4",
            "webm",
            "mov",
            "m4v",
            "mkv",
            "avi",
            "ogg",
            "ogv",
          ].includes(ext)
        );
      });
      if (files.length === 0) return;

      try {
        const uploaded = await uploadMediaFilesToCms(files);
        const res = mutateAddCanvasItems(
          uploaded.map((u) => ({
            title: u.title,
            year: new Date().getFullYear().toString(),
            mediaType: u.mediaType,
            imageUrl: u.url,
            videoUrl: u.mediaType === "video" ? u.url : undefined,
            width: u.width,
            height: u.height,
          })),
        );
        updateCmsItemsIfChanged(res.items);
        toast.success(
          `Added ${uploaded.length} ${uploaded.length === 1 ? "item" : "items"} randomly to the canvas.`,
        );
        const newest = res.items[0];
        if (newest) {
          window.setTimeout(() => {
            focusProjectOnCanvas(newest);
          }, 90);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add media to canvas");
      }
    },
    [focusProjectOnCanvas, updateCmsItemsIfChanged],
  );

  const handleCanvasDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.stopPropagation();
      if (!isDropTargetActive) setIsDropTargetActive(true);
    }
  };

  const handleCanvasDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDropTargetActive(false);
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropTargetActive(false);
    void handleFilesAddedToCanvas(event.dataTransfer.files);
  };

  const handleCardClick = useCallback(
    (project: PortfolioCanvasProject) => {
      if (suppressNextCardClickRef.current) {
        suppressNextCardClickRef.current = false;
        return;
      }
      openProjectModal(project);
    },
    [openProjectModal],
  );

  const handleCardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, project: PortfolioCanvasProject) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProjectModal(project);
      }
    },
    [openProjectModal],
  );

  const handleRandomizeCard = useCallback(
    (project: PortfolioCanvasProject) => {
      const res = mutateRandomizeCanvasItemPosition(project.id);
      updateCmsItemsIfChanged(res.items);
      toast.success(`Moved "${project.title}" to a new random non-overlapping spot.`);
    },
    [updateCmsItemsIfChanged],
  );

  const handleDeleteCard = useCallback(
    (project: PortfolioCanvasProject) => {
      if (onRequestDeleteItem) {
        onRequestDeleteItem(project);
        return;
      }
      const res = mutateDeleteCanvasItem(project.id);
      updateCmsItemsIfChanged(res.items);
      toast.success(`Deleted "${project.title}" from canvas.`);
    },
    [onRequestDeleteItem, updateCmsItemsIfChanged],
  );

  const handleViewportKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomByStep(0.2, 220);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomByStep(-0.2, 220);
    } else if (event.key === "0" || event.key.toLowerCase() === "r") {
      event.preventDefault();
      handleResetView(400);
    }
  };

  const navigateModalProject = (direction: 1 | -1) => {
    if (!selectedProject) return;
    const currentIndex = allProjects.findIndex((p) => p.id === selectedProject.id);
    const nextIndex = (currentIndex + direction + allProjects.length) % allProjects.length;
    const nextProject = allProjects[nextIndex];
    if (nextProject) {
      openProjectModal(nextProject);
    }
  };

  const handlePhotoPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanningPhoto(true);
    photoPanStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      originX: photoPan.x,
      originY: photoPan.y,
    };
  };

  const handlePhotoPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!photoPanStartRef.current) return;
    const dx = event.clientX - photoPanStartRef.current.clientX;
    const dy = event.clientY - photoPanStartRef.current.clientY;
    setPhotoPan({
      x: photoPanStartRef.current.originX + dx,
      y: photoPanStartRef.current.originY + dy,
    });
  };

  const handlePhotoPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanningPhoto(false);
    photoPanStartRef.current = null;
  };

  const handlePhotoDoubleClick = () => {
    if (photoScale > 1.05) {
      resetPhotoTransform();
    } else {
      setPhotoScale(2.25);
    }
  };

  const selectedModalVideoUrl = selectedProject
    ? resolveProjectVideoUrl(selectedProject)
    : undefined;

  const canvasViewport = (
    <div
      ref={viewportRef}
      data-lenis-prevent
      data-lenis-prevent-wheel
      data-lenis-prevent-touch
      tabIndex={0}
      role="region"
      aria-label="Interactive infinite portfolio canvas. Drag to pan, scroll to zoom, or use the on-screen controls."
      onKeyDown={handleViewportKeyDown}
      onPointerDown={handleViewportPointerDown}
      onPointerMove={handleViewportPointerMove}
      onPointerUp={handleViewportPointerUp}
      onPointerCancel={handleViewportPointerUp}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
      style={{ touchAction: "none" }}
      className={`canvas-studio-grid cursor-grab relative w-full overflow-hidden rounded-[2rem] border shadow-[0_30px_100px_-20px_rgba(0,0,0,0.9)] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
        embeddedPreview ? "h-[440px] sm:h-[520px]" : "mt-10 h-[560px] sm:h-[670px] lg:h-[760px]"
      } ${isDropTargetActive ? "border-white/45 ring-2 ring-white/30" : "border-white/12"}`}
    >
      {/* Subtle Ambient Radial Vignette inside Viewport */}
      <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_90px_rgba(0,0,0,0.75)]" />

      {/* Top-Left Floating Liquid-Glass Hint Pill */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2 sm:left-6 sm:top-6">
        <div className="liquid-glass inline-flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[0.68rem] tracking-wider text-foreground/90">
          <Move className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">
            {embeddedPreview
              ? `Live Synced Canvas (${allProjects.length} cards) · Drag to pan · Scroll to zoom · Click card to preview`
              : "Drag to explore · Scroll to zoom · Click photo to zoom · Click video for sound"}
          </span>
          <span className="sm:hidden">Drag to explore · Pinch to zoom</span>
        </div>
      </div>

      {/* Bottom-Left Quick Center Button (Liquid Glass) */}
      <div className="absolute bottom-4 left-4 z-20 hidden items-center gap-1.5 sm:bottom-6 sm:left-6 md:flex">
        <button
          type="button"
          onClick={() => handleResetView(500)}
          className="liquid-glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-foreground/90 transition-all hover:border-white/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Center canvas view"
        >
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Center View</span>
        </button>
      </div>

      {/* Bottom-Right Floating Liquid-Glass Zoom & Reset Controls */}
      <div
        className="liquid-glass absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-full p-1.5 sm:bottom-6 sm:right-6"
        role="toolbar"
        aria-label="Canvas zoom and camera controls"
      >
        <button
          type="button"
          onClick={() => zoomByStep(-0.22, 240)}
          aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-white/12 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <Minus className="h-4 w-4" />
        </button>

        <span
          ref={zoomReadoutRef}
          aria-live="off"
          aria-label={`Current zoom level ${lastZoomPercentRef.current} percent`}
          className="min-w-[3.4rem] text-center font-mono text-xs font-medium tabular-nums text-foreground/90"
        >
          {lastZoomPercentRef.current}%
        </span>

        <button
          type="button"
          onClick={() => zoomByStep(0.22, 240)}
          aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-white/12 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="mx-0.5 h-4 w-px bg-white/15" aria-hidden="true" />

        <button
          type="button"
          onClick={() => handleResetView(480)}
          aria-label="Reset canvas camera view"
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-white/12 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Hardware-Accelerated Stage with explicit bounds so browser tile culling never clips or shutters cards when zoomed out */}
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${canvasBounds.width}px`,
          height: `${canvasBounds.height}px`,
          transformOrigin: "0 0",
          transform: `translate3d(${initialX}px, ${initialY}px, 0) scale(${initialScale})`,
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {/* Subtle Architectural Studio Crosshairs */}
        <div
          aria-hidden="true"
          style={{
            width: `${canvasBounds.width}px`,
            height: `${canvasBounds.height}px`,
          }}
          className="pointer-events-none absolute left-0 top-0 border border-white/[0.04]"
        >
          <div
            className="absolute left-0 right-0 h-px bg-white/[0.04]"
            style={{ top: `${CANVAS_DIMENSIONS.initialFocusY}px` }}
          />
          <div
            className="absolute bottom-0 top-0 w-px bg-white/[0.04]"
            style={{ left: `${CANVAS_DIMENSIONS.initialFocusX}px` }}
          />
        </div>

        {/* Standalone Media Cards in Original Aspect Ratio */}
        {allProjects.map((project) => (
          <CanvasProjectCard
            key={project.id}
            project={project}
            isHighlighted={highlightedId === project.id}
            embeddedPreview={embeddedPreview}
            onCardClick={handleCardClick}
            onCardKeyDown={handleCardKeyDown}
            onRegisterAspect={registerNaturalAspect}
            onRandomizeItem={handleRandomizeCard}
            onDeleteItem={handleDeleteCard}
          />
        ))}
      </div>
    </div>
  );

  const lightboxPortal =
    mounted &&
    typeof document !== "undefined" &&
    createPortal(
      <AnimatePresence>
        {selectedProject && (
          <motion.div
            key="portfolio-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            data-lenis-prevent
            role="dialog"
            aria-modal="true"
            aria-label={selectedProject.title}
            onClick={closeProjectModal}
            className="fixed inset-0 z-[9999] flex flex-col bg-black/92 backdrop-blur-xl"
          >
            {/* Top Floating Bar */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative z-30 flex items-center justify-between gap-3 px-4 py-4 sm:px-6"
            >
              <div className="liquid-glass inline-flex min-w-0 items-center gap-2.5 rounded-full px-4 py-2 text-xs text-foreground/90">
                <span className="max-w-[180px] truncate font-medium sm:max-w-md">
                  {selectedProject.title}
                </span>
                {!selectedModalVideoUrl && (
                  <>
                    <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">
                      ·
                    </span>
                    <span className="hidden text-[0.68rem] text-muted-foreground sm:inline">
                      Scroll or double-click to zoom · Drag to pan
                    </span>
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedProject;
                    closeProjectModal();
                    focusProjectOnCanvas(target);
                  }}
                  aria-label="Locate on canvas"
                  className="liquid-glass hidden h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-white/20 sm:inline-flex"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Locate</span>
                </button>

                {selectedProject.externalUrl && (
                  <a
                    href={selectedProject.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="liquid-glass inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-white/20"
                  >
                    <span>Open</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={closeProjectModal}
                  aria-label="Close preview"
                  className="liquid-glass inline-flex h-10 items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <X className="h-4 w-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Center Interactive Media Stage */}
            <div
              ref={photoStageRef}
              data-lenis-prevent
              data-lenis-prevent-wheel
              data-lenis-prevent-touch
              className="relative flex flex-1 w-full items-center justify-center overflow-hidden px-4 py-2 sm:px-12"
            >
              {/* Previous Item Floating Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateModalProject(-1);
                }}
                aria-label="Previous item"
                className="liquid-glass absolute left-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/20 sm:left-6"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {/* Next Item Floating Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateModalProject(1);
                }}
                aria-label="Next item"
                className="liquid-glass absolute right-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/20 sm:right-6"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              {selectedModalVideoUrl && !videoError ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="relative flex max-h-[78vh] max-w-[86vw] items-center justify-center"
                >
                  <InteractiveVideo
                    key={selectedModalVideoUrl}
                    src={selectedModalVideoUrl}
                    poster={selectedProject.imageUrl}
                    alt={selectedProject.title}
                    autoPlay
                    controls
                    playImmediatelyWithSound
                    onVideoError={() => setVideoError(true)}
                    className="max-h-[78vh] max-w-[86vw] h-auto w-auto rounded-2xl object-contain shadow-2xl"
                  />
                </div>
              ) : (
                <div
                  onPointerDown={handlePhotoPointerDown}
                  onPointerMove={handlePhotoPointerMove}
                  onPointerUp={handlePhotoPointerUp}
                  onPointerCancel={handlePhotoPointerUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handlePhotoDoubleClick();
                  }}
                  style={{ touchAction: "none" }}
                  className={`flex h-full w-full items-center justify-center overflow-hidden select-none ${
                    isPanningPhoto
                      ? "cursor-grabbing"
                      : photoScale > 1.02
                        ? "cursor-grab"
                        : "cursor-zoom-in"
                  }`}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      transform: `translate3d(${photoPan.x}px, ${photoPan.y}px, 0) scale(${photoScale})`,
                      transition: isPanningPhoto ? "none" : "transform 160ms ease-out",
                    }}
                    className="flex items-center justify-center"
                  >
                    <MediaImage
                      key={selectedProject.imageUrl}
                      src={selectedProject.imageUrl}
                      alt={selectedProject.title}
                      draggable={false}
                      className="max-h-[76vh] max-w-[84vw] h-auto w-auto rounded-xl object-contain shadow-2xl select-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Floating Bar: Controls + Close Option for Every Format */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative z-30 flex items-center justify-center pb-5 pt-2"
            >
              <div
                className="liquid-glass flex items-center gap-1 rounded-full p-1.5"
                role="toolbar"
                aria-label="Preview controls"
              >
                {!selectedModalVideoUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => adjustPhotoZoom(-0.3)}
                      aria-label="Zoom out photo"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-white/15 hover:text-foreground"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>

                    <span className="min-w-[3.4rem] text-center font-mono text-xs font-medium tabular-nums text-foreground/90">
                      {photoZoomPercent}%
                    </span>

                    <button
                      type="button"
                      onClick={() => adjustPhotoZoom(0.3)}
                      aria-label="Zoom in photo"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-white/15 hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                    <div className="mx-0.5 h-3.5 w-px bg-white/15" aria-hidden="true" />

                    <button
                      type="button"
                      onClick={resetPhotoTransform}
                      aria-label="Reset photo zoom"
                      className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-white/15 hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>

                    <div className="mx-0.5 h-3.5 w-px bg-white/15" aria-hidden="true" />
                  </>
                )}

                <button
                  type="button"
                  onClick={closeProjectModal}
                  aria-label="Close preview"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/25"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    );

  if (embeddedPreview) {
    return (
      <div className="relative w-full">
        {canvasViewport}
        {lightboxPortal}
      </div>
    );
  }

  return (
    <section id="work" className="relative px-4 py-24 sm:px-6 sm:py-36">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Reveal>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.45em] text-muted-foreground">
                ⟶ Selected Work · Infinite Studio Canvas
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-5 font-display text-balance text-[2.5rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl">
                Curated across
                <br />
                <span className="italic font-semibold text-muted-foreground">an open canvas.</span>
              </h2>
            </Reveal>
          </div>

          <Reveal delay={0.16}>
            <p className="max-w-md text-pretty text-sm leading-[1.7] text-muted-foreground sm:text-base">
              Drag freely across the workspace. Click any photo to open an interactive zoomable
              preview, or click any video to play it with sound.
            </p>
          </Reveal>
        </div>

        {/* Bounded Infinite Canvas Viewport */}
        {canvasViewport}
      </div>

      {lightboxPortal}
    </section>
  );
}
