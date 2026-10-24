import { Volume2, VolumeX, ExternalLink } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { isVideoSource, MediaImage, SilentAutoPlayVideo } from "@/components/MediaImage";
import { Reveal } from "@/components/Reveal";
import { expandCanvasProjects, type PortfolioCanvasProject } from "@/data/portfolioProjects";
import {
  buildResolvedCanvasItemsFromStore,
  loadSynchronizedCmsState,
  readLocalCmsStore,
} from "@/lib/cms-storage";

function resolveProjectVideoUrl(project: PortfolioCanvasProject): string | undefined {
  if (project.videoUrl) return project.videoUrl;
  if (isVideoSource(project.imageUrl)) return project.imageUrl;
  return undefined;
}

function isProjectVideo(project: PortfolioCanvasProject): boolean {
  return project.mediaType === "video" || Boolean(resolveProjectVideoUrl(project));
}

interface ShowcaseItemCardProps {
  project: PortfolioCanvasProject;
  isSoundOn: boolean;
  onToggleSound: (id: string) => void;
}

const ShowcaseItemCard = memo(function ShowcaseItemCard({
  project,
  isSoundOn,
  onToggleSound,
}: ShowcaseItemCardProps) {
  const videoSrc = resolveProjectVideoUrl(project);
  const isVideo = isProjectVideo(project);
  const safeWidth = project.width > 0 ? project.width : isVideo ? 270 : 310;
  const safeHeight = project.height > 0 ? project.height : isVideo ? 380 : 310;

  return (
    <article
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: `${safeWidth}px ${safeHeight}px`,
      }}
      onClick={isVideo ? () => onToggleSound(project.id) : undefined}
      className={`group relative mb-6 break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 transition-colors duration-200 hover:border-white/25 ${
        isVideo ? "cursor-pointer" : ""
      }`}
    >
      <div
        style={{
          aspectRatio: `${safeWidth} / ${safeHeight}`,
        }}
        className="relative w-full overflow-hidden bg-neutral-950"
      >
        {isVideo && videoSrc ? (
          <SilentAutoPlayVideo
            src={videoSrc}
            alt={project.title}
            soundEnabled={isSoundOn}
            className="h-full w-full object-cover"
          />
        ) : (
          <MediaImage
            src={project.imageUrl}
            alt={project.title}
            maxRenderDimension={960}
            className="h-full w-full object-cover"
          />
        )}

        {/* Subtle bottom info & Sound Toggle for Videos (No preview modal) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4">
          <div className="min-w-0 flex-1">
            {project.title && (
              <h3 className="truncate font-display text-sm font-medium text-white/95 drop-shadow-xs">
                {project.title}
              </h3>
            )}
            {project.year && <p className="mt-0.5 text-[0.68rem] text-white/60">{project.year}</p>}
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            {project.externalUrl && (
              <a
                href={project.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Open project link"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/75 text-white/80 backdrop-blur-md transition-colors hover:border-white/40 hover:text-white"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}

            {isVideo && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSound(project.id);
                }}
                aria-label={isSoundOn ? "Mute sound" : "Play sound"}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium backdrop-blur-md transition-all ${
                  isSoundOn
                    ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-200 shadow-lg"
                    : "border-white/15 bg-black/75 text-white/90 hover:border-white/40 hover:bg-black/90"
                }`}
              >
                {isSoundOn ? (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Sound On</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="h-3.5 w-3.5 text-white/75" />
                    <span>Play Sound</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

export function Showcase() {
  const [cmsProjects, setCmsProjects] = useState<PortfolioCanvasProject[]>(() => {
    const localStore = readLocalCmsStore();
    return buildResolvedCanvasItemsFromStore(localStore).items;
  });
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [unmutedItemId, setUnmutedItemId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const syncFromStore = async () => {
      try {
        const synced = await loadSynchronizedCmsState();
        if (active && synced?.items) {
          setCmsProjects(synced.items);
        }
      } catch {
        // Keep local store state
      }
    };

    void syncFromStore();

    const handleLocalUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ items?: PortfolioCanvasProject[] }>;
      if (custom.detail?.items) {
        setCmsProjects(custom.detail.items);
      } else {
        const latest = buildResolvedCanvasItemsFromStore(readLocalCmsStore());
        setCmsProjects(latest.items);
      }
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key && event.key.includes("showcase_cms_store")) {
        const latest = buildResolvedCanvasItemsFromStore(readLocalCmsStore());
        setCmsProjects(latest.items);
      }
    };

    window.addEventListener("canvas-cms-updated", handleLocalUpdate);
    window.addEventListener("canvas-cms-server-synced", handleLocalUpdate);
    window.addEventListener("storage", handleStorageEvent);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel("grvnth_showcase_cms_channel_v8");
        channel.onmessage = (msg) => {
          if (msg.data?.items && Array.isArray(msg.data.items)) {
            setCmsProjects(msg.data.items as PortfolioCanvasProject[]);
          } else {
            const latest = buildResolvedCanvasItemsFromStore(readLocalCmsStore());
            setCmsProjects(latest.items);
          }
        };
      } catch {
        channel = null;
      }
    }

    return () => {
      active = false;
      window.removeEventListener("canvas-cms-updated", handleLocalUpdate);
      window.removeEventListener("canvas-cms-server-synced", handleLocalUpdate);
      window.removeEventListener("storage", handleStorageEvent);
      if (channel) {
        try {
          channel.close();
        } catch {
          // Ignore close error
        }
      }
    };
  }, []);

  const allItems = useMemo(() => expandCanvasProjects(cmsProjects), [cmsProjects]);

  const videoCount = useMemo(
    () => allItems.filter((item) => isProjectVideo(item)).length,
    [allItems],
  );
  const imageCount = useMemo(
    () => allItems.filter((item) => !isProjectVideo(item)).length,
    [allItems],
  );

  const filteredItems = useMemo(() => {
    if (filter === "video") {
      return allItems.filter((item) => isProjectVideo(item));
    }
    if (filter === "image") {
      return allItems.filter((item) => !isProjectVideo(item));
    }
    return allItems;
  }, [allItems, filter]);

  const handleToggleSound = useCallback((id: string) => {
    setUnmutedItemId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <section id="work" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6 md:px-10">
        {/* Section Header */}
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Reveal>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                01 / Selected Works
              </p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
                Showcase
              </h2>
            </Reveal>
          </div>

          {allItems.length > 0 && (
            <Reveal delay={0.1}>
              <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-neutral-900/70 p-1 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    filter === "all"
                      ? "bg-white text-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({allItems.length})
                </button>
                {videoCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilter("video")}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      filter === "video"
                        ? "bg-white text-black"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Videos ({videoCount})
                  </button>
                )}
                {imageCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilter("image")}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      filter === "image"
                        ? "bg-white text-black"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Graphics ({imageCount})
                  </button>
                )}
              </div>
            </Reveal>
          )}
        </div>

        {/* Normal Masonry / Responsive Showcase Grid */}
        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-neutral-950/50 px-6 py-20 text-center">
            <p className="font-display text-base font-medium text-foreground/80">
              No showcase works published yet.
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              New videos and graphics will appear here automatically as soon as they are uploaded.
            </p>
          </div>
        ) : (
          <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
            {filteredItems.map((project) => (
              <ShowcaseItemCard
                key={project.id}
                project={project}
                isSoundOn={unmutedItemId === project.id}
                onToggleSound={handleToggleSound}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
