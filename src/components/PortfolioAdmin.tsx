import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type FormEvent,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  Lock,
  Unlock,
  Save,
  Check,
  UploadCloud,
  Search,
  Video,
  Image as ImageIcon,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  GripVertical,
  Volume2,
  VolumeX,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { type PortfolioCanvasProject } from "@/data/portfolioProjects";
import {
  broadcastCanvasCmsUpdate,
  canUndoCmsAction,
  loadSynchronizedCmsState,
  mutateAddCanvasItems,
  mutateClearAllCanvasItems,
  mutateDeleteCanvasItem,
  mutateReorderCanvasItems,
  mutateUndoLastCmsAction,
  mutateUpdateCanvasItem,
  pushStoreToServer,
  readLocalCmsStore,
  uploadMediaFilesToCms,
} from "@/lib/cms-storage";
import { MediaImage, SilentAutoPlayVideo } from "@/components/MediaImage";

const AUTH_STORAGE_KEY = "grvnth_cms_auth_token_v8";
const ADMIN_PASSCODE = "Granth@246";

export function PortfolioAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const authed = Boolean(
        window.localStorage.getItem(AUTH_STORAGE_KEY) ||
        window.sessionStorage.getItem(AUTH_STORAGE_KEY),
      );
      if (authed) {
        setIsAuthenticated(true);
      }
    }
  }, []);

  const [items, setItems] = useState<PortfolioCanvasProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image">("all");
  const [unmutedItemId, setUnmutedItemId] = useState<string | null>(null);

  // Drag & Drop Upload & Progress States
  const [isWindowFileDragging, setIsWindowFileDragging] = useState(false);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [isModalDropzoneActive, setIsModalDropzoneActive] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);

  // Drag & Drop Card Reordering States
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newYear, setNewYear] = useState(() => new Date().getFullYear().toString());
  const [newMediaType, setNewMediaType] = useState<"image" | "video">("image");
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newExternalUrl, setNewExternalUrl] = useState("");
  const [newWidth, setNewWidth] = useState(310);
  const [newHeight, setNewHeight] = useState(310);

  // Edit Item Modal
  const [editingItem, setEditingItem] = useState<PortfolioCanvasProject | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [editWidth, setEditWidth] = useState(310);
  const [editHeight, setEditHeight] = useState(310);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickDropInputRef = useRef<HTMLInputElement>(null);
  const windowDragCounterRef = useRef(0);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadSynchronizedCmsState();
      setItems(res?.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void loadItems();
    }
  }, [isAuthenticated, loadItems]);

  // High-speed streaming upload handler for 1 or multiple dropped/selected files
  const handleDirectDropFilesUpload = useCallback(async (fileList: FileList | File[]) => {
    const validFiles = Array.from(fileList).filter(
      (file) =>
        file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov|m4v|mkv|avi)$/i.test(file.name),
    );

    if (validFiles.length === 0) {
      toast.error("Please drop valid image or video files");
      return;
    }

    setSyncing(true);
    setUploadPercent(5);
    setUploadStatusText(
      `Preparing ${validFiles.length} ${validFiles.length === 1 ? "file" : "files"}...`,
    );

    try {
      const descriptors = await uploadMediaFilesToCms(validFiles, (pct, text) => {
        setUploadPercent(pct);
        setUploadStatusText(text);
      });

      if (descriptors.length === 0) {
        toast.error("Could not process media files");
        return;
      }

      const currentYear = new Date().getFullYear().toString();
      const payloads = descriptors.map((desc, idx) => ({
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idx}`,
        title: desc.title.charAt(0).toUpperCase() + desc.title.slice(1),
        description: "",
        year: currentYear,
        mediaType: desc.mediaType,
        imageUrl: desc.url,
        videoUrl: desc.mediaType === "video" ? desc.url : undefined,
        width: desc.width,
        height: desc.height,
      }));

      const localRes = mutateAddCanvasItems(payloads);
      setItems(localRes.items);
      broadcastCanvasCmsUpdate(localRes.items, payloads[0]?.id);
      toast.success(
        `Added ${payloads.length} ${payloads.length === 1 ? "item" : "items"} to Showcase!`,
      );
    } catch {
      toast.error("Failed to upload files");
    } finally {
      setSyncing(false);
      window.setTimeout(() => {
        setUploadPercent(null);
        setUploadStatusText(null);
      }, 600);
    }
  }, []);

  // Replace an existing card's media by dropping a file directly onto the card
  const handleReplaceCardMediaByDrop = useCallback(
    async (targetItem: PortfolioCanvasProject, file: File) => {
      setSyncing(true);
      setUploadPercent(10);
      setUploadStatusText(`Replacing media for "${targetItem.title}"...`);
      try {
        const descriptors = await uploadMediaFilesToCms([file], (pct, text) => {
          setUploadPercent(pct);
          setUploadStatusText(text);
        });
        const desc = descriptors[0];
        if (!desc) {
          toast.error("Could not read dropped media file");
          return;
        }
        const localRes = mutateUpdateCanvasItem({
          id: targetItem.id,
          mediaType: desc.mediaType,
          imageUrl: desc.url,
          videoUrl: desc.mediaType === "video" ? desc.url : "",
          width: desc.width,
          height: desc.height,
        });
        setItems(localRes.items);
        broadcastCanvasCmsUpdate(localRes.items, targetItem.id);
        toast.success(`Updated media for "${targetItem.title}"`);
      } catch {
        toast.error("Failed to replace media");
      } finally {
        setSyncing(false);
        window.setTimeout(() => {
          setUploadPercent(null);
          setUploadStatusText(null);
        }, 600);
      }
    },
    [],
  );

  // Global window file drag listeners so dropping files anywhere on the screen works
  useEffect(() => {
    if (!isAuthenticated) return;

    const hasFiles = (e: globalThis.DragEvent) =>
      Boolean(e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes("Files"));

    const onWindowDragEnter = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      windowDragCounterRef.current += 1;
      setIsWindowFileDragging(true);
    };

    const onWindowDragOver = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };

    const onWindowDragLeave = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      windowDragCounterRef.current = Math.max(0, windowDragCounterRef.current - 1);
      if (windowDragCounterRef.current === 0) {
        setIsWindowFileDragging(false);
      }
    };

    const onWindowDrop = (e: globalThis.DragEvent) => {
      windowDragCounterRef.current = 0;
      setIsWindowFileDragging(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0 && !isAddModalOpen) {
        void handleDirectDropFilesUpload(e.dataTransfer.files);
      }
    };

    window.addEventListener("dragenter", onWindowDragEnter);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragenter", onWindowDragEnter);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [isAuthenticated, isAddModalOpen, handleDirectDropFilesUpload]);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (passcodeInput.trim() === ADMIN_PASSCODE) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
        window.sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
      }
      setIsAuthenticated(true);
      setAuthError(false);
      toast.success("Welcome back");
    } else {
      setAuthError(true);
      toast.error("Invalid passcode");
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
    setIsAuthenticated(false);
    toast.info("Signed out");
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const store = readLocalCmsStore();
      await pushStoreToServer(store, true);
      const res = await loadSynchronizedCmsState();
      if (res?.items) {
        setItems(res.items);
      }
      toast.success(`Synced ${items.length} showcase items!`);
    } catch {
      toast.error("Failed to sync showcase");
    } finally {
      setSyncing(false);
    }
  };

  const handleUndo = () => {
    const res = mutateUndoLastCmsAction();
    if (res) {
      setItems(res.items);
      broadcastCanvasCmsUpdate(res.items);
      toast.success("Undid last action");
    }
  };

  const handleClearAll = () => {
    const res = mutateClearAllCanvasItems();
    setItems(res.items);
    broadcastCanvasCmsUpdate(res.items);
    toast.success("Cleared all showcase items");
  };

  const processModalSelectedFile = async (file: File) => {
    const isVideo =
      file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(file.name);
    setNewMediaType(isVideo ? "video" : "image");
    setUploadPercent(10);
    setUploadStatusText("Reading & streaming media...");

    try {
      const descriptors = await uploadMediaFilesToCms([file], (pct, text) => {
        setUploadPercent(pct);
        setUploadStatusText(text);
      });
      const desc = descriptors[0];
      if (desc) {
        setNewMediaUrl(desc.url);
        if (desc.mediaType === "video") {
          setNewVideoUrl(desc.url);
        }
        setNewWidth(desc.width);
        setNewHeight(desc.height);
        if (!newTitle) {
          setNewTitle(desc.title.charAt(0).toUpperCase() + desc.title.slice(1));
        }
        toast.success(`Loaded ${file.name}`);
      }
    } catch {
      toast.error("Failed to read file");
    } finally {
      window.setTimeout(() => {
        setUploadPercent(null);
        setUploadStatusText(null);
      }, 500);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processModalSelectedFile(file);
  };

  const handleQuickDropInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleDirectDropFilesUpload(e.target.files);
      e.target.value = "";
    }
  };

  const handleCreateItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMediaUrl.trim()) {
      toast.error("Please provide an image or video file / URL");
      return;
    }

    setSyncing(true);
    const id = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newItem = {
      id,
      title: newTitle.trim() || "Untitled Work",
      description: "",
      year: newYear.trim() || new Date().getFullYear().toString(),
      mediaType: newMediaType,
      imageUrl: newMediaUrl.trim(),
      videoUrl: newMediaType === "video" ? newVideoUrl.trim() || newMediaUrl.trim() : undefined,
      externalUrl: newExternalUrl.trim() || undefined,
      width: newWidth,
      height: newHeight,
    };

    try {
      const localRes = mutateAddCanvasItems([newItem]);
      setItems(localRes.items);
      broadcastCanvasCmsUpdate(localRes.items, id);
      setIsAddModalOpen(false);
      setNewTitle("");
      setNewMediaUrl("");
      setNewVideoUrl("");
      setNewExternalUrl("");
      toast.success(`Added "${newItem.title}" to Showcase!`);
    } catch {
      toast.error("Failed to add item");
    } finally {
      setSyncing(false);
    }
  };

  const openEditModal = (item: PortfolioCanvasProject) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditYear(item.year || new Date().getFullYear().toString());
    setEditExternalUrl(item.externalUrl || "");
    setEditWidth(item.width);
    setEditHeight(item.height);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setSyncing(true);
    const payload = {
      id: editingItem.id,
      title: editTitle,
      year: editYear,
      externalUrl: editExternalUrl,
      width: editWidth,
      height: editHeight,
    };
    try {
      const localRes = mutateUpdateCanvasItem(payload);
      setItems(localRes.items);
      broadcastCanvasCmsUpdate(localRes.items, editingItem.id);
      setEditingItem(null);
      toast.success(`Updated "${editTitle}"`);
    } catch {
      toast.error("Failed to update item");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteItem = async (id: string, title: string) => {
    setSyncing(true);
    try {
      const localRes = mutateDeleteCanvasItem(id);
      setItems(localRes.items);
      if (unmutedItemId === id) setUnmutedItemId(null);
      broadcastCanvasCmsUpdate(localRes.items);
      toast.success(`Deleted "${title}"`);
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setSyncing(false);
    }
  };

  // Drag & Drop Reorder / File Replace on Cards
  const handleCardDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    setDraggedCardId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleCardDragOver = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverCardId !== targetId) {
      setDragOverCardId(targetId);
    }
  };

  const handleCardDrop = (e: DragEvent<HTMLDivElement>, targetItem: PortfolioCanvasProject) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCardId(null);
    windowDragCounterRef.current = 0;
    setIsWindowFileDragging(false);

    // 1. If user dropped a file from their computer onto this card, replace its media
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleReplaceCardMediaByDrop(targetItem, e.dataTransfer.files[0]);
      setDraggedCardId(null);
      return;
    }

    // 2. Otherwise reorder the Showcase items
    const sourceId = draggedCardId || e.dataTransfer.getData("text/plain");
    setDraggedCardId(null);
    if (!sourceId || sourceId === targetItem.id) return;

    const currentIds = items.map((i) => i.id);
    const fromIdx = currentIds.indexOf(sourceId);
    const toIdx = currentIds.indexOf(targetItem.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const nextIds = [...currentIds];
    const [moved] = nextIds.splice(fromIdx, 1);
    nextIds.splice(toIdx, 0, moved);

    const localRes = mutateReorderCanvasItems(nextIds);
    setItems(localRes.items);
    broadcastCanvasCmsUpdate(localRes.items, sourceId);
    toast.success("Updated Showcase display order");
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (mediaFilter === "video" && item.mediaType !== "video") return false;
      if (mediaFilter === "image" && item.mediaType === "video") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesYear = (item.year || "").toLowerCase().includes(q);
        return matchesTitle || matchesYear;
      }
      return true;
    });
  }, [items, mediaFilter, searchQuery]);

  const videoCount = useMemo(() => items.filter((i) => i.mediaType === "video").length, [items]);
  const imageCount = useMemo(() => items.filter((i) => i.mediaType !== "video").length, [items]);

  // LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-foreground">
            <Lock className="h-6 w-6 text-foreground/80" />
          </div>

          <h1 className="text-center font-display text-2xl font-bold tracking-tight">
            Admin Access
          </h1>
          <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
            Enter your admin passcode to manage the Showcase, upload videos & graphics, and reorder
            works.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="passcode"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Passcode
              </label>
              <input
                id="passcode"
                type="password"
                value={passcodeInput}
                onChange={(e) => {
                  setPasscodeInput(e.target.value);
                  setAuthError(false);
                }}
                placeholder="Enter passcode"
                autoFocus
                className={`w-full rounded-xl border bg-black/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 ${
                  authError
                    ? "border-red-500/80 focus:ring-red-500/30"
                    : "border-white/15 focus:border-white/40 focus:ring-white/20"
                }`}
              />
              {authError && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" /> Invalid passcode.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-90"
            >
              <Unlock className="h-4 w-4" />
              <span>Unlock Showcase Manager</span>
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Return to Website
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // MAIN SHOWCASE CMS
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Full-Window Drag & Drop File Overlay */}
      {isWindowFileDragging && !isAddModalOpen && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-md">
          <div className="flex max-w-md flex-col items-center rounded-3xl border-2 border-dashed border-emerald-400/80 bg-neutral-900/95 p-10 text-center shadow-2xl">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <UploadCloud className="h-8 w-8 animate-bounce" />
            </div>
            <h2 className="font-display text-xl font-bold text-white">
              Drop Media Anywhere to Publish
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Release your videos or images anywhere on the screen to stream and publish them
              immediately to the Showcase.
            </p>
          </div>
        </div>
      )}

      {/* Top Sticky Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-neutral-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Live Site</span>
            </Link>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-lg font-bold tracking-tight">Showcase Manager</h1>
              <span className="hidden items-center gap-1 text-xs text-emerald-400 sm:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5" /> Zero-Lag Streaming
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {canUndoCmsAction() && (
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white/10"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-white/10 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Sync</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span>Add Media</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Metrics Ribbon */}
        <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Published Works
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold">{items.length}</span>
              <span className="text-xs text-muted-foreground">in Showcase</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Autoplay Videos
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-amber-400">{videoCount}</span>
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Graphics & Stills
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-sky-400">{imageCount}</span>
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Streaming Engine
            </span>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <Check className="h-4 w-4" />
              <span>Instant 0ms Autoplay</span>
            </div>
          </div>
        </section>

        {/* High-Speed Drag & Drop Upload Zone */}
        <section className="mb-8">
          <input
            ref={quickDropInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleQuickDropInputChange}
            className="hidden"
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isDropzoneActive) setIsDropzoneActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDropzoneActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDropzoneActive(false);
              windowDragCounterRef.current = 0;
              setIsWindowFileDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                void handleDirectDropFilesUpload(e.dataTransfer.files);
              }
            }}
            onClick={() => quickDropInputRef.current?.click()}
            className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-6 transition-all ${
              isDropzoneActive
                ? "border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                : "border-white/15 bg-neutral-900/40 hover:border-white/35 hover:bg-neutral-900/70"
            }`}
          >
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
                    isDropzoneActive
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                      : "border-white/10 bg-white/5 text-emerald-400 group-hover:border-white/25"
                  }`}
                >
                  <UploadCloud className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-semibold text-foreground">
                    {uploadStatusText ||
                      "Drag & Drop Videos or Images Here (Supports Multi-GB / 10-Hour Videos)"}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Zero-copy streaming starts playback immediately in 0ms while chunked upload
                    completes in the background. Drag cards below to reorder.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-foreground transition-colors group-hover:bg-white group-hover:text-black">
                  Select Files
                </span>
              </div>
            </div>

            {uploadPercent !== null && (
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  style={{ width: `${uploadPercent}%` }}
                  className="h-full bg-emerald-400 transition-all duration-200"
                />
              </div>
            )}
          </div>
        </section>

        {/* Filter & Search Bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search showcase items..."
              className="w-full rounded-xl border border-white/15 bg-black/40 py-2 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-white/40 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/10 bg-black/40 p-1">
              <button
                type="button"
                onClick={() => setMediaFilter("all")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  mediaFilter === "all"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaFilter("video")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  mediaFilter === "video"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Video className="h-3 w-3" /> Videos ({videoCount})
              </button>
              <button
                type="button"
                onClick={() => setMediaFilter("image")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  mediaFilter === "image"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ImageIcon className="h-3 w-3" /> Graphics ({imageCount})
              </button>
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
              >
                Clear All
              </button>
            )}

            <button
              type="button"
              onClick={loadItems}
              title="Refresh Showcase"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Showcase Items Grid */}
        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-neutral-900/30 p-16 text-center">
            <p className="font-display text-base font-medium text-foreground">
              Your Showcase is currently empty.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag and drop videos or images into the box above (or click &quot;Add Media&quot;) to
              publish your first item.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredItems.map((project, index) => {
              const isVid = project.mediaType === "video" || Boolean(project.videoUrl);
              const isSoundOn = unmutedItemId === project.id;
              const isBeingDragged = draggedCardId === project.id;
              const isDragTarget = dragOverCardId === project.id && draggedCardId !== project.id;

              return (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => handleCardDragStart(e, project.id)}
                  onDragOver={(e) => handleCardDragOver(e, project.id)}
                  onDragLeave={() => {
                    if (dragOverCardId === project.id) setDragOverCardId(null);
                  }}
                  onDrop={(e) => handleCardDrop(e, project)}
                  onDragEnd={() => {
                    setDraggedCardId(null);
                    setDragOverCardId(null);
                  }}
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "280px 300px",
                  }}
                  className={`group relative flex cursor-grab flex-col overflow-hidden rounded-2xl border bg-neutral-900/60 transition-all active:cursor-grabbing ${
                    isBeingDragged
                      ? "scale-95 border-emerald-400/50 opacity-50"
                      : isDragTarget
                        ? "border-emerald-400 ring-2 ring-emerald-400/40 shadow-xl"
                        : "border-white/10 hover:border-white/25 hover:shadow-xl"
                  }`}
                >
                  {isDragTarget && (
                    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-emerald-950/75 p-4 text-center backdrop-blur-xs">
                      <span className="rounded-xl border border-emerald-400/50 bg-black/80 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                        {draggedCardId ? "Drop to Reorder" : "Drop File to Replace Media"}
                      </span>
                    </div>
                  )}

                  {/* Inline Autoplay Video / Image Preview (No preview modal, only Sound toggle) */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/85">
                    {isVid ? (
                      <SilentAutoPlayVideo
                        src={project.videoUrl || project.imageUrl}
                        soundEnabled={isSoundOn}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <MediaImage
                        src={project.imageUrl}
                        alt={project.title}
                        maxRenderDimension={480}
                        className="h-full w-full object-cover"
                      />
                    )}

                    {/* Top Order & Type Readout */}
                    <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-md bg-black/75 px-2 py-0.5 text-[0.65rem] font-medium text-white backdrop-blur-md">
                      <span className="font-mono text-white/60">#{index + 1}</span>
                      <span>·</span>
                      <span>{isVid ? "Video" : "Graphic"}</span>
                    </div>

                    {/* Drag Handle */}
                    <div
                      title="Drag to reorder"
                      className="absolute right-2.5 top-2.5 z-10 flex items-center rounded-md bg-black/75 p-1 text-muted-foreground backdrop-blur-md group-hover:text-white"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>

                    {/* Direct Sound Toggle Button on Videos */}
                    {isVid && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUnmutedItemId((prev) => (prev === project.id ? null : project.id));
                        }}
                        className={`absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.68rem] font-medium backdrop-blur-md transition-colors ${
                          isSoundOn
                            ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-200"
                            : "border-white/15 bg-black/75 text-white/90 hover:border-white/40"
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

                  {/* Card Footer */}
                  <div className="flex flex-1 flex-col justify-between p-3.5">
                    <div>
                      <h3 className="line-clamp-1 font-display text-sm font-semibold text-foreground">
                        {project.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                        <span>{project.year || "2026"}</span>
                        <span>·</span>
                        <span>
                          {project.width} × {project.height}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(project)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(project.id, project.title)}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
                        title="Delete from Showcase"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ADD ITEM MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-foreground">Add Showcase Item</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag & drop a video or image below, browse your computer, or paste a direct URL.
            </p>

            <form onSubmit={handleCreateItem} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                  Media File (Drag & Drop or Click)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isModalDropzoneActive) setIsModalDropzoneActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsModalDropzoneActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsModalDropzoneActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      void processModalSelectedFile(file);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-xs font-medium transition-colors ${
                    isModalDropzoneActive
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                      : "border-white/25 bg-black/30 text-foreground hover:border-white/50"
                  }`}
                >
                  <UploadCloud className="h-5 w-5 text-emerald-400" />
                  <span>Drag & Drop Video or Image Here, or Click to Browse</span>
                </div>
                {uploadStatusText && (
                  <p className="mt-1 text-[0.68rem] text-emerald-400">{uploadStatusText}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                  Or Media URL
                </label>
                <input
                  type="text"
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  placeholder="https://... (image or video URL)"
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-white/40 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Project Title"
                    required
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-white/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Year
                  </label>
                  <input
                    type="text"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    placeholder="2026"
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-white/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Media Type
                  </label>
                  <select
                    value={newMediaType}
                    onChange={(e) =>
                      setNewMediaType(e.target.value === "video" ? "video" : "image")
                    }
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
                  >
                    <option value="image">Graphic / Image</option>
                    <option value="video">Video (Autoplay + Sound Option)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    External Link (Optional)
                  </label>
                  <input
                    type="text"
                    value={newExternalUrl}
                    onChange={(e) => setNewExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-white/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={syncing}
                  className="rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {syncing ? "Publishing..." : "Publish to Showcase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ITEM MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-foreground">
              Edit &quot;{editingItem.title}&quot;
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Update title, year, external link, or aspect ratio dimensions.
            </p>

            <form onSubmit={handleSaveEdit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                  Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Year
                  </label>
                  <input
                    type="text"
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    External Link
                  </label>
                  <input
                    type="text"
                    value={editExternalUrl}
                    onChange={(e) => setEditExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Aspect Width
                  </label>
                  <input
                    type="number"
                    value={editWidth}
                    onChange={(e) => setEditWidth(Number(e.target.value) || 310)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Aspect Height
                  </label>
                  <input
                    type="number"
                    value={editHeight}
                    onChange={(e) => setEditHeight(Number(e.target.value) || 310)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={syncing}
                  className="rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {syncing ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
