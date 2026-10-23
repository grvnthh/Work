import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Compass,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  LogOut,
  Shuffle,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MediaImage, SilentAutoPlayVideo, isVideoSource } from "@/components/MediaImage";
import { Showcase } from "@/components/sections/Showcase";
import { clearCmsAuthentication, isCmsAuthenticated } from "@/routes/auth";
import { expandCanvasProjects, type PortfolioCanvasProject } from "@/data/portfolioProjects";
import {
  broadcastCanvasCmsUpdate,
  buildResolvedCanvasItemsFromStore,
  canUndoCmsAction,
  flushPendingCmsPush,
  loadSynchronizedCmsState,
  mutateAddCanvasItems,
  mutateClearAllCanvasItems,
  mutateDeleteCanvasItem,
  mutateFocusCanvasItem,
  mutateRandomizeCanvasItemPosition,
  mutateShuffleAllCanvasItems,
  mutateUndoLastCmsAction,
  readLocalCmsStore,
  uploadMediaFilesToCms,
} from "@/lib/cms-storage";

export interface PortfolioAdminProps {
  embedded?: boolean;
  onClose?: () => void;
  onItemsChange?: (items: PortfolioCanvasProject[]) => void;
  onLocateOnCanvas?: (project: PortfolioCanvasProject) => void;
}

type PendingDeletionConfirmation =
  | {
      type: "delete-item";
      item: PortfolioCanvasProject;
    }
  | {
      type: "clear-all";
      count: number;
    };

export function PortfolioAdmin({
  embedded = false,
  onClose,
  onItemsChange,
  onLocateOnCanvas,
}: PortfolioAdminProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PortfolioCanvasProject[]>(
    () => buildResolvedCanvasItemsFromStore(readLocalCmsStore()).items,
  );
  const [canUndo, setCanUndo] = useState<boolean>(() => canUndoCmsAction());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showLiveCanvasPreview, setShowLiveCanvasPreview] = useState(false);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingDeletionConfirmation | null>(null);
  const [filterType, setFilterType] = useState<"all" | "image" | "video">("all");

  const quickUploadInputRef = useRef<HTMLInputElement>(null);
  const canvasPreviewSectionRef = useRef<HTMLDivElement>(null);
  const movedTimerRef = useRef<number | null>(null);
  const isInternalSyncRef = useRef(false);

  const syncState = useCallback(
    (res: { items: PortfolioCanvasProject[] }, focusedId?: string) => {
      setItems(res.items);
      setCanUndo(canUndoCmsAction());
      onItemsChange?.(res.items);
      if (focusedId) {
        isInternalSyncRef.current = true;
        try {
          broadcastCanvasCmsUpdate(res.items, focusedId);
        } finally {
          isInternalSyncRef.current = false;
        }
      }
    },
    [onItemsChange],
  );

  const handleUndoDelete = useCallback(() => {
    isInternalSyncRef.current = true;
    try {
      const restored = mutateUndoLastCmsAction();
      if (restored) {
        syncState(restored);
        void flushPendingCmsPush();
        toast.success("Undid last deletion and restored canvas items!");
      }
    } finally {
      isInternalSyncRef.current = false;
    }
  }, [syncState]);

  const loadState = useCallback(async () => {
    try {
      setLoading(true);
      const res = await loadSynchronizedCmsState();
      setItems(res.items);
      setCanUndo(canUndoCmsAction());
      onItemsChange?.(res.items);
      isInternalSyncRef.current = true;
      try {
        broadcastCanvasCmsUpdate(res.items);
      } finally {
        isInternalSyncRef.current = false;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Canvas CMS");
    } finally {
      setLoading(false);
    }
  }, [onItemsChange]);

  useEffect(() => {
    if (!isCmsAuthenticated()) {
      void navigate({ to: "/auth", replace: true });
      return;
    }
    const localResolved = buildResolvedCanvasItemsFromStore(readLocalCmsStore());
    setItems(localResolved.items);
    setCanUndo(canUndoCmsAction());
    void loadState();

    const onExternalUpdate = () => {
      if (isInternalSyncRef.current) return;
      const resolved = buildResolvedCanvasItemsFromStore(readLocalCmsStore());
      setItems(resolved.items);
      setCanUndo(canUndoCmsAction());
    };

    window.addEventListener("canvas-cms-updated", onExternalUpdate);
    window.addEventListener("storage", onExternalUpdate);
    return () => {
      window.removeEventListener("canvas-cms-updated", onExternalUpdate);
      window.removeEventListener("storage", onExternalUpdate);
    };
  }, [loadState, navigate]);

  // Close confirmation modal on Escape key
  useEffect(() => {
    if (!pendingConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPendingConfirm(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingConfirm]);

  const markRecentlyMoved = useCallback((id: string) => {
    setRecentlyMovedId(id);
    if (movedTimerRef.current) {
      window.clearTimeout(movedTimerRef.current);
    }
    movedTimerRef.current = window.setTimeout(() => {
      setRecentlyMovedId((prev) => (prev === id ? null : prev));
    }, 2400);
  }, []);

  const handleSignOut = async () => {
    clearCmsAuthentication();
    toast.success("Signed out of Studio CMS.");
    await navigate({ to: "/auth", replace: true });
  };

  const expandedItems = useMemo(() => expandCanvasProjects(items), [items]);
  const totalCanvasCards = expandedItems.length;
  const totalVideoCards = useMemo(
    () =>
      expandedItems.filter(
        (p) => p.mediaType === "video" || isVideoSource(p.videoUrl || p.imageUrl),
      ).length,
    [expandedItems],
  );
  const totalPhotoCards = totalCanvasCards - totalVideoCards;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const isVid = item.mediaType === "video" || isVideoSource(item.videoUrl || item.imageUrl);
      if (filterType === "video" && !isVid) return false;
      if (filterType === "image" && isVid) return false;
      return true;
    });
  }, [items, filterType]);

  // Direct single or multi-file upload -> automatically placed on canvas in original aspect ratio
  const handleQuickUploadFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const validFiles = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return (
        f.type.startsWith("image/") ||
        f.type.startsWith("video/") ||
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

    if (validFiles.length === 0) {
      toast.error("Please select image or video files.");
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadMediaFilesToCms(validFiles);
      isInternalSyncRef.current = true;
      const res = mutateAddCanvasItems(
        uploaded.map((u) => ({
          title: u.title,
          mediaType: u.mediaType,
          imageUrl: u.url,
          videoUrl: u.mediaType === "video" ? u.url : undefined,
          width: u.width,
          height: u.height,
        })),
      );
      isInternalSyncRef.current = false;
      syncState(res, res.lastFocusedId);
      if (res.lastFocusedId) {
        markRecentlyMoved(res.lastFocusedId);
      }
      await flushPendingCmsPush();
      toast.success(
        `Uploaded ${uploaded.length} ${uploaded.length === 1 ? "file" : "files"} directly to the canvas!`,
      );
    } catch (err) {
      isInternalSyncRef.current = false;
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (quickUploadInputRef.current) {
        quickUploadInputRef.current.value = "";
      }
    }
  };

  // Request confirmation before deleting an item
  const requestDeleteItem = useCallback((item: PortfolioCanvasProject) => {
    setPendingConfirm({
      type: "delete-item",
      item,
    });
  }, []);

  // Request confirmation before clearing all items
  const requestClearAllItems = () => {
    setPendingConfirm({
      type: "clear-all",
      count: items.length,
    });
  };

  // Execute confirmed deletion
  const handleConfirmPendingDeletion = () => {
    if (!pendingConfirm) return;
    const action = pendingConfirm;
    setPendingConfirm(null);

    isInternalSyncRef.current = true;
    try {
      if (action.type === "delete-item") {
        const res = mutateDeleteCanvasItem(action.item.id);
        syncState(res);
        void flushPendingCmsPush();
        toast.success("Removed item from canvas.", {
          action: {
            label: "Undo",
            onClick: handleUndoDelete,
          },
        });
      } else if (action.type === "clear-all") {
        const res = mutateClearAllCanvasItems();
        syncState(res);
        void flushPendingCmsPush();
        toast.success("Cleared all items from the canvas.", {
          action: {
            label: "Undo",
            onClick: handleUndoDelete,
          },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      isInternalSyncRef.current = false;
    }
  };

  // Re-randomize an item's canvas position without overlapping
  const handleRandomizePosition = (item: PortfolioCanvasProject) => {
    isInternalSyncRef.current = true;
    try {
      const res = mutateRandomizeCanvasItemPosition(item.id);
      syncState(res, item.id);
      markRecentlyMoved(item.id);
      void flushPendingCmsPush();
      const updatedItem = res.items.find((i) => i.id === item.id);
      toast.success(
        updatedItem
          ? `Moved item to position (${updatedItem.canvasX}, ${updatedItem.canvasY}).`
          : "Randomized item position on canvas.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to randomize position");
    } finally {
      isInternalSyncRef.current = false;
    }
  };

  // Shuffle all items on the canvas
  const handleShuffleAllPositions = () => {
    isInternalSyncRef.current = true;
    try {
      const res = mutateShuffleAllCanvasItems();
      syncState(res);
      void flushPendingCmsPush();
      toast.success("Randomized all item positions across the canvas without overlap!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to shuffle canvas");
    } finally {
      isInternalSyncRef.current = false;
    }
  };

  // Locate an item on the Live Canvas
  const handleLocateItem = (item: PortfolioCanvasProject) => {
    isInternalSyncRef.current = true;
    const res = mutateFocusCanvasItem(item.id);
    isInternalSyncRef.current = false;
    syncState(res, item.id);
    markRecentlyMoved(item.id);

    if (onLocateOnCanvas) {
      onLocateOnCanvas(item);
      return;
    }

    if (!showLiveCanvasPreview) {
      setShowLiveCanvasPreview(true);
    }

    window.setTimeout(() => {
      canvasPreviewSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      isInternalSyncRef.current = true;
      try {
        broadcastCanvasCmsUpdate(res.items, item.id);
      } finally {
        isInternalSyncRef.current = false;
      }
    }, 60);
  };

  const handleDropZoneDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDropZoneDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  };

  const handleDropZoneDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    void handleQuickUploadFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={
        embedded
          ? "flex h-full w-full flex-col bg-neutral-950/95 text-foreground"
          : "min-h-screen bg-background text-foreground grain"
      }
    >
      {/* Top Studio Header Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/90 px-4 py-3.5 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            {embedded && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-white/15"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Canvas</span>
              </button>
            ) : (
              <Link
                to="/"
                hash="work"
                className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-white/15"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Live Canvas</span>
              </Link>
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-emerald-400">
                  Studio CMS · Granth Agrawal
                </span>
              </div>
              <h1 className="font-display text-base font-bold tracking-tight sm:text-xl">
                Infinite Canvas Dashboard
              </h1>
            </div>
          </div>

          {/* Stats & Primary Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[0.65rem] text-muted-foreground lg:inline-flex">
              <span>{items.length} Items</span>
              <span>·</span>
              <span>{totalPhotoCards} Pics</span>
              <span>·</span>
              <span>{totalVideoCards} Videos</span>
            </div>

            {canUndo && (
              <button
                type="button"
                onClick={handleUndoDelete}
                title="Undo last delete action"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span>Undo</span>
              </button>
            )}

            {!embedded && (
              <button
                type="button"
                onClick={() => setShowLiveCanvasPreview((prev) => !prev)}
                className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-white/15"
              >
                {showLiveCanvasPreview ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Hide Canvas</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Preview Canvas</span>
                  </>
                )}
              </button>
            )}

            {items.length > 1 && (
              <button
                type="button"
                onClick={handleShuffleAllPositions}
                className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-white/15"
                title="Randomize all items across canvas without overlap"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Shuffle All</span>
              </button>
            )}

            {items.length > 0 && (
              <button
                type="button"
                onClick={requestClearAllItems}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            )}

            <button
              type="button"
              disabled={uploading}
              onClick={() => quickUploadInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold uppercase tracking-wider text-background transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>{uploading ? "Uploading…" : "Upload to Canvas"}</span>
            </button>

            <input
              ref={quickUploadInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.mp4,.webm,.mov,.m4v,.mkv,.avi,.png,.jpg,.jpeg,.webp,.gif,.svg,.avif"
              className="hidden"
              onChange={(e) => void handleQuickUploadFiles(e.target.files)}
            />

            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Sign out of CMS"
              className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/15 hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>

            {embedded && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close CMS"
                className="liquid-glass flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-8">
        {/* Direct Drag-and-Drop Multi-File Upload Zone */}
        <div
          onDragOver={handleDropZoneDragOver}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDropZoneDrop}
          onClick={() => !uploading && quickUploadInputRef.current?.click()}
          className={`group relative cursor-pointer overflow-hidden rounded-[1.75rem] border border-dashed p-6 transition-all sm:p-8 ${
            isDragOver
              ? "border-white/60 bg-white/[0.08]"
              : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]"
          }`}
        >
          <div className="flex flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="liquid-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-foreground">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-muted-foreground">
                  Instant Direct Upload · Single or Multiple Files
                </p>
                <h2 className="mt-1 font-display text-lg font-bold sm:text-xl">
                  Drop one or many photos & videos here to upload directly to the canvas
                </h2>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  Every uploaded file is automatically placed on the infinite canvas in its original
                  aspect ratio with zero extra steps.
                </p>
              </div>
            </div>

            <span className="liquid-glass shrink-0 rounded-full px-5 py-2.5 text-xs font-semibold text-foreground transition-colors group-hover:bg-white/15">
              {uploading ? "Uploading to Canvas…" : "Select Files"}
            </span>
          </div>
        </div>

        {/* Live Synced Interactive Canvas Preview inside CMS */}
        {showLiveCanvasPreview && !embedded && (
          <div
            ref={canvasPreviewSectionRef}
            className="space-y-3 rounded-[2rem] border border-white/12 bg-white/[0.02] p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div>
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.35em] text-emerald-400">
                  ● Live Synced Workspace
                </span>
                <h3 className="mt-0.5 font-display text-lg font-bold">
                  Interactive Canvas Preview
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleShuffleAllPositions}
                  className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-white/15"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  <span>Randomize All Positions</span>
                </button>
                <Link
                  to="/"
                  hash="work"
                  className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-white/15"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Full Screen Portfolio</span>
                </Link>
              </div>
            </div>
            <Showcase embeddedPreview onRequestDeleteItem={requestDeleteItem} />
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "all", label: `All (${items.length})`, icon: Layers },
                { id: "image", label: `Photos (${totalPhotoCards})`, icon: ImageIcon },
                { id: "video", label: `Videos (${totalVideoCards})`, icon: Film },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-all ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "liquid-glass text-foreground/80 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Items Grid */}
        {loading && items.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading canvas media…</span>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="font-display text-lg font-semibold">No media on the canvas yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Drop or select one or multiple photos and videos above to automatically place them on
              the canvas.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const videoSrc =
                item.videoUrl || (isVideoSource(item.imageUrl) ? item.imageUrl : undefined);
              const isVideo = item.mediaType === "video" || Boolean(videoSrc);
              const isRecentlyMoved = recentlyMovedId === item.id;

              return (
                <article
                  key={item.id}
                  className={`group flex flex-col overflow-hidden rounded-[1.5rem] border bg-neutral-950/90 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85)] transition-colors ${
                    isRecentlyMoved
                      ? "border-emerald-400/80 ring-2 ring-emerald-400/30"
                      : "border-white/12 hover:border-white/25"
                  }`}
                >
                  {/* Media Preview in Natural Aspect Ratio */}
                  <div className="relative flex min-h-[240px] max-h-[320px] w-full items-center justify-center overflow-hidden bg-black/80 p-3">
                    {videoSrc ? (
                      <SilentAutoPlayVideo
                        src={videoSrc}
                        poster={
                          item.imageUrl && !isVideoSource(item.imageUrl) ? item.imageUrl : undefined
                        }
                        alt={item.title}
                        className="max-h-[280px] w-auto max-w-full rounded-xl object-contain"
                      />
                    ) : (
                      <MediaImage
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        maxRenderDimension={600}
                        className="max-h-[280px] w-auto max-w-full rounded-xl object-contain"
                      />
                    )}

                    {/* Top-Left Media Badge */}
                    <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-3.5rem)] flex-wrap items-center gap-1.5">
                      <span className="liquid-glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-foreground">
                        {isVideo ? (
                          <>
                            <Volume2 className="h-3 w-3" />
                            <span>Video</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-3 w-3" />
                            <span>Photo</span>
                          </>
                        )}
                      </span>
                      <span className="liquid-glass rounded-full px-2.5 py-1 font-mono text-[0.6rem] text-muted-foreground">
                        {item.width}×{item.height}
                      </span>
                    </div>

                    {/* Top-Right Quick Delete Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDeleteItem(item);
                      }}
                      title="Delete from canvas"
                      aria-label="Delete item from canvas"
                      className="liquid-glass absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-red-500/80 hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Clean Card Actions Footer */}
                  <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRandomizePosition(item);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[0.68rem] font-medium text-foreground transition-all hover:bg-white/15 active:scale-95"
                        title="Place at random non-overlapping position"
                      >
                        <Shuffle className="h-3 w-3" />
                        <span>Random Pos</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLocateItem(item);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.03] px-2.5 py-1 text-[0.68rem] font-medium text-foreground/85 transition-colors hover:bg-white/10 hover:text-foreground"
                        title="Locate card in live canvas workspace"
                      >
                        <Compass className="h-3 w-3" />
                        <span>Locate</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`hidden font-mono text-[0.6rem] sm:inline ${
                          isRecentlyMoved
                            ? "font-semibold text-emerald-400"
                            : "text-muted-foreground/70"
                        }`}
                      >
                        ({item.canvasX}, {item.canvasY})
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteItem(item);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[0.68rem] font-medium text-red-300 transition-colors hover:bg-red-500/25 active:scale-95"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Liquid-Glass Delete Confirmation Modal */}
      {typeof document !== "undefined" &&
        pendingConfirm &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cms-delete-confirm-title"
            onClick={() => setPendingConfirm(null)}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-white/15 bg-neutral-950 p-6 text-foreground shadow-[0_30px_90px_rgba(0,0,0,0.95)] sm:p-7"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15 text-red-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-red-400">
                    Confirm Deletion
                  </p>
                  <h3
                    id="cms-delete-confirm-title"
                    className="mt-1 font-display text-xl font-bold leading-snug text-foreground"
                  >
                    {pendingConfirm.type === "clear-all"
                      ? `Delete all ${pendingConfirm.count} items from the canvas?`
                      : "Delete this item from the canvas?"}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {pendingConfirm.type === "clear-all"
                      ? `This will remove all ${pendingConfirm.count} items from the live canvas. You can undo this action afterward.`
                      : "Are you sure you want to remove this media item from your portfolio canvas?"}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="liquid-glass inline-flex h-10 items-center justify-center rounded-full px-5 text-xs font-semibold text-foreground transition-colors hover:bg-white/15"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPendingDeletion}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-red-500 px-5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>
                    {pendingConfirm.type === "clear-all" ? "Yes, Clear All" : "Yes, Delete"}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
