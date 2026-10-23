import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type FormEvent,
  type ChangeEvent,
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
  Shuffle,
  UploadCloud,
  Search,
  Video,
  Image as ImageIcon,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PORTFOLIO_CANVAS_PROJECTS, type PortfolioCanvasProject } from "@/data/portfolioProjects";
import {
  broadcastCanvasCmsUpdate,
  loadSynchronizedCmsState,
  mutateAddCanvasItems,
  mutateUpdateCanvasItem,
  mutateDeleteCanvasItem,
  mutateRandomizeCanvasItemPosition,
  pushStoreToServer,
  readLocalCmsStore,
} from "@/lib/cms-storage";

const AUTH_STORAGE_KEY = "grvnth_cms_auth_token_v5";
const ADMIN_PASSCODE = "Granth@246";

export function PortfolioAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean(
      window.localStorage.getItem(AUTH_STORAGE_KEY) ||
      window.sessionStorage.getItem(AUTH_STORAGE_KEY),
    );
  });
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState(false);

  const [items, setItems] = useState<PortfolioCanvasProject[]>(() => PORTFOLIO_CANVAS_PROJECTS);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image">("all");

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newYear, setNewYear] = useState("2026");
  const [newMediaType, setNewMediaType] = useState<"image" | "video">("image");
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newExternalUrl, setNewExternalUrl] = useState("");
  const [newWidth, setNewWidth] = useState(310);
  const [newHeight, setNewHeight] = useState(310);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Edit Item Modal
  const [editingItem, setEditingItem] = useState<PortfolioCanvasProject | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [editCanvasX, setEditCanvasX] = useState(0);
  const [editCanvasY, setEditCanvasY] = useState(0);
  const [editWidth, setEditWidth] = useState(310);
  const [editHeight, setEditHeight] = useState(310);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadSynchronizedCmsState();
      if (res?.items && res.items.length > 0) {
        setItems(res.items);
      } else {
        setItems(PORTFOLIO_CANVAS_PROJECTS);
      }
    } catch (err) {
      console.warn("Failed to load synchronized canvas items, using base:", err);
      setItems(PORTFOLIO_CANVAS_PROJECTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void loadItems();
    }
  }, [isAuthenticated, loadItems]);

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
    toast.info("Signed out of dashboard");
  };

  const handleManualSyncToCode = async () => {
    setSyncing(true);
    try {
      const store = readLocalCmsStore();
      await pushStoreToServer(store, true);
      const res = await loadSynchronizedCmsState();
      if (res?.items) {
        setItems(res.items);
      }
      toast.success(`Synced ${items.length} projects to cloud & disk!`);
    } catch {
      toast.error("Failed to sync store");
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    setNewMediaType(isVideo ? "video" : "image");
    setUploadProgress("Reading media file...");

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setNewMediaUrl(result);
      if (isVideo) {
        setNewVideoUrl(result);
        setNewWidth(270);
        setNewHeight(380);
      } else {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            const ratio = img.naturalWidth / img.naturalHeight;
            const targetArea = 310 * 310;
            const rawW = Math.round(Math.min(460, Math.max(220, Math.sqrt(targetArea * ratio))));
            const rawH = Math.round(rawW / ratio);
            setNewWidth(rawW);
            setNewHeight(rawH);
          }
        };
        img.src = result;
      }

      if (!newTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setNewTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
      setUploadProgress(null);
      toast.success(`Loaded ${file.name}`);
    };
    reader.readAsDataURL(file);
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
      title: newTitle.trim() || "Untitled Project",
      description: "",
      year: newYear.trim() || "2026",
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
      toast.success(`"${newItem.title}" added and locked to canvas!`);
    } catch {
      toast.error("Failed to add project to canvas");
    } finally {
      setSyncing(false);
    }
  };

  const openEditModal = (item: PortfolioCanvasProject) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditYear(item.year || "2026");
    setEditExternalUrl(item.externalUrl || "");
    setEditCanvasX(item.canvasX);
    setEditCanvasY(item.canvasY);
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
      canvasX: editCanvasX,
      canvasY: editCanvasY,
      width: editWidth,
      height: editHeight,
    };
    try {
      const localRes = mutateUpdateCanvasItem(payload);
      setItems(localRes.items);
      broadcastCanvasCmsUpdate(localRes.items, editingItem.id);
      setEditingItem(null);
      toast.success(`Saved changes to "${editTitle}"`);
    } catch {
      toast.error("Failed to update item");
    } finally {
      setSyncing(false);
    }
  };

  const handleNudgeItem = async (id: string, title: string) => {
    setSyncing(true);
    try {
      const localRes = mutateRandomizeCanvasItemPosition(id);
      setItems(localRes.items);
      broadcastCanvasCmsUpdate(localRes.items, id);
      toast.success(`Repositioned "${title}"`);
    } catch {
      toast.error("Failed to reposition item");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteItem = async (id: string, title: string) => {
    setSyncing(true);
    try {
      const localRes = mutateDeleteCanvasItem(id);
      setItems(localRes.items);
      broadcastCanvasCmsUpdate(localRes.items);
      toast.success(`Removed "${title}"`);
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setSyncing(false);
    }
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
            Enter your admin passcode to access portfolio media, canvas layouts, and dual-store
            sync.
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
              <span>Unlock Dashboard</span>
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

  // MAIN CMS DASHBOARD
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top sticky navbar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Live Site</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold tracking-tight">Granth Dashboard</h1>
                <span className="hidden items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-emerald-400 sm:inline-flex">
                  <ShieldCheck className="h-3 w-3" /> Zero-Drift Locked
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleManualSyncToCode}
              disabled={syncing}
              title="Dual-write to both data/canvas-cms.json and src/data/portfolioProjects.ts"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-white/10 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Sync to Code</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span>Add Media</span>
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Status / Metric Ribbon */}
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Total Live Items
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold">{items.length}</span>
              <span className="text-xs text-muted-foreground">on Canvas</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Motion Graphic Reels
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-amber-400">{videoCount}</span>
              <span className="text-xs text-muted-foreground">Active MP4s</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Artwork & Graphics
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-sky-400">{imageCount}</span>
              <span className="text-xs text-muted-foreground">Designs</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4">
            <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
              Dual-Storage Sync
            </span>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <Check className="h-4 w-4" />
              <span>Locked for 20+ Years</span>
            </div>
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
              placeholder="Search projects..."
              className="w-full rounded-xl border border-white/15 bg-black/40 py-2 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-white/40 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/10 bg-black/40 p-1">
              <button
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
                onClick={() => setMediaFilter("image")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  mediaFilter === "image"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ImageIcon className="h-3 w-3" /> Images ({imageCount})
              </button>
            </div>

            <button
              onClick={loadItems}
              title="Refresh from server"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Project Grid */}
        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-neutral-900/30 p-12 text-center">
            <p className="text-sm text-muted-foreground">No projects matching your filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredItems.map((project) => {
              const isVid = project.mediaType === "video" || Boolean(project.videoUrl);
              return (
                <div
                  key={project.id}
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "280px 300px",
                  }}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60 transition-all hover:border-white/25 hover:shadow-xl"
                >
                  {/* Thumbnail / Media Preview */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/80">
                    {isVid ? (
                      <video
                        src={project.videoUrl || project.imageUrl}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <img
                        src={project.imageUrl}
                        alt={project.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}

                    {/* Media Type Badge */}
                    <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-[0.62rem] font-medium tracking-wide text-white backdrop-blur-md">
                      {isVid ? (
                        <>
                          <Video className="h-3 w-3 text-amber-400" />
                          <span>Motion Graphic</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-3 w-3 text-sky-400" />
                          <span>Graphic</span>
                        </>
                      )}
                    </div>

                    {/* Quick Position Readout */}
                    <div className="absolute bottom-2.5 left-2.5 z-10 rounded-md bg-black/75 px-2 py-0.5 text-[0.62rem] font-mono text-muted-foreground backdrop-blur-md">
                      X: {project.canvasX} · Y: {project.canvasY}
                    </div>
                  </div>

                  {/* Info & Metadata */}
                  <div className="flex flex-1 flex-col justify-between p-3.5">
                    <div>
                      <h3 className="line-clamp-1 font-display text-sm font-semibold text-foreground">
                        {project.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-[0.68rem] text-muted-foreground">
                        <span>{project.year || "2026"}</span>
                        <span>•</span>
                        <span>
                          {project.width} × {project.height}px
                        </span>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(project)}
                          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
                          title="Edit project details"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleNudgeItem(project.id, project.title)}
                          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
                          title="Reposition on canvas"
                        >
                          <Shuffle className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteItem(project.id, project.title)}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
                        title="Delete from portfolio"
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
            <h2 className="font-display text-xl font-bold text-foreground">Add Canvas Project</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload an image/video or paste a URL. It will automatically be locked into both disk &
              code.
            </p>

            <form onSubmit={handleCreateItem} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                  Media File (Direct Upload)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 bg-black/30 px-4 py-4 text-xs font-medium text-foreground transition-colors hover:border-white/50"
                >
                  <UploadCloud className="h-4 w-4 text-emerald-400" />
                  <span>Choose Image or Video File</span>
                </button>
                {uploadProgress && (
                  <p className="mt-1 text-[0.68rem] text-emerald-400">{uploadProgress}</p>
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
                    <option value="video">Motion Graphic / Video</option>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Width (px)
                  </label>
                  <input
                    type="number"
                    value={newWidth}
                    onChange={(e) => setNewWidth(Number(e.target.value) || 310)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Height (px)
                  </label>
                  <input
                    type="number"
                    value={newHeight}
                    onChange={(e) => setNewHeight(Number(e.target.value) || 310)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-foreground focus:border-white/40 focus:outline-none"
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
                  {syncing ? "Saving..." : "Add to Canvas"}
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
              Adjust coordinates, dimensions, or details. Changes sync instantly across the site.
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

              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <span className="mb-2 block text-[0.68rem] font-semibold uppercase tracking-wider text-emerald-400">
                  Canvas Position & Geometry
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[0.65rem] text-muted-foreground">
                      Canvas X
                    </label>
                    <input
                      type="number"
                      value={editCanvasX}
                      onChange={(e) => setEditCanvasX(Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.65rem] text-muted-foreground">
                      Canvas Y
                    </label>
                    <input
                      type="number"
                      value={editCanvasY}
                      onChange={(e) => setEditCanvasY(Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.65rem] text-muted-foreground">
                      Width (px)
                    </label>
                    <input
                      type="number"
                      value={editWidth}
                      onChange={(e) => setEditWidth(Number(e.target.value) || 310)}
                      className="w-full rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.65rem] text-muted-foreground">
                      Height (px)
                    </label>
                    <input
                      type="number"
                      value={editHeight}
                      onChange={(e) => setEditHeight(Number(e.target.value) || 310)}
                      className="w-full rounded-lg border border-white/15 bg-neutral-900 px-3 py-1.5 text-xs text-foreground"
                    />
                  </div>
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
