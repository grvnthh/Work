import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type FormEvent,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
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
  Move,
  GripVertical,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  Map as MapIcon,
  Columns,
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
  mutateSwapCanvasItemPositions,
  pushStoreToServer,
  readLocalCmsStore,
  uploadMediaFilesToCms,
} from "@/lib/cms-storage";
import { MediaImage, SilentAutoPlayVideo } from "@/components/MediaImage";

const AUTH_STORAGE_KEY = "grvnth_cms_auth_token_v5";
const ADMIN_PASSCODE = "Granth@246";
const CANVAS_WORLD_WIDTH = 3800;
const CANVAS_WORLD_HEIGHT = 2700;

type WorkspaceViewMode = "split" | "canvas" | "grid";

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
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("split");

  // Global & Zone Drag-and-Drop States
  const [isWindowFileDragging, setIsWindowFileDragging] = useState(false);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [isModalDropzoneActive, setIsModalDropzoneActive] = useState(false);
  const [isCanvasFileDropActive, setIsCanvasFileDropActive] = useState(false);
  const [uploadingFilesMessage, setUploadingFilesMessage] = useState<string | null>(null);

  // Grid Card Drag-and-Drop States (Swap positions or drop file onto card)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  // Interactive 2D Canvas Map States
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(0.22);
  const [canvasPan, setCanvasPan] = useState<{ x: number; y: number }>({ x: 40, y: 24 });
  const [selectedCanvasItemId, setSelectedCanvasItemId] = useState<string | null>(null);
  const [activeCanvasDrag, setActiveCanvasDrag] = useState<{
    id: string;
    startClientX: number;
    startClientY: number;
    initialCanvasX: number;
    initialCanvasY: number;
    currentCanvasX: number;
    currentCanvasY: number;
  } | null>(null);
  const [activeCanvasPanDrag, setActiveCanvasPanDrag] = useState<{
    startClientX: number;
    startClientY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

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
  const quickDropInputRef = useRef<HTMLInputElement>(null);
  const windowDragCounterRef = useRef(0);

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

  // Fit 2D Canvas Map nicely inside viewport on initial mount / resize
  const fitCanvasToViewport = useCallback(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scaleX = (rect.width - 48) / CANVAS_WORLD_WIDTH;
    const scaleY = (rect.height - 48) / CANVAS_WORLD_HEIGHT;
    const nextScale = Math.max(0.12, Math.min(0.6, Math.min(scaleX, scaleY)));
    const nextPanX = Math.round((rect.width - CANVAS_WORLD_WIDTH * nextScale) / 2);
    const nextPanY = Math.round((rect.height - CANVAS_WORLD_HEIGHT * nextScale) / 2);
    setCanvasScale(nextScale);
    setCanvasPan({ x: nextPanX, y: nextPanY });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || viewMode === "grid") return;
    const timer = window.setTimeout(() => {
      fitCanvasToViewport();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, viewMode, fitCanvasToViewport]);

  // Shared helper: Upload & add dropped files directly to the Canvas
  const handleDirectDropFilesUpload = useCallback(
    async (fileList: FileList | File[], targetCoords?: { canvasX: number; canvasY: number }) => {
      const validFiles = Array.from(fileList).filter(
        (file) =>
          file.type.startsWith("image/") ||
          file.type.startsWith("video/") ||
          /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov|m4v)$/i.test(file.name),
      );

      if (validFiles.length === 0) {
        toast.error("Please drop valid image or video files");
        return;
      }

      setSyncing(true);
      setUploadingFilesMessage(
        `Uploading ${validFiles.length} ${validFiles.length === 1 ? "file" : "files"} to Canvas...`,
      );

      try {
        const descriptors = await uploadMediaFilesToCms(validFiles);
        if (descriptors.length === 0) {
          toast.error("Could not process dropped media files");
          return;
        }

        const currentYear = new Date().getFullYear().toString();
        const payloads = descriptors.map((desc, idx) => {
          const offsetPos = targetCoords
            ? {
                canvasX: Math.max(
                  80,
                  Math.min(
                    CANVAS_WORLD_WIDTH - desc.width - 80,
                    Math.round(targetCoords.canvasX - desc.width / 2 + idx * 44),
                  ),
                ),
                canvasY: Math.max(
                  80,
                  Math.min(
                    CANVAS_WORLD_HEIGHT - desc.height - 80,
                    Math.round(targetCoords.canvasY - desc.height / 2 + idx * 44),
                  ),
                ),
              }
            : {};

          return {
            id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idx}`,
            title: desc.title.charAt(0).toUpperCase() + desc.title.slice(1),
            description: "",
            year: currentYear,
            mediaType: desc.mediaType,
            imageUrl: desc.url,
            videoUrl: desc.mediaType === "video" ? desc.url : undefined,
            width: desc.width,
            height: desc.height,
            ...offsetPos,
          };
        });

        const localRes = mutateAddCanvasItems(payloads);
        setItems(localRes.items);
        if (payloads[0]?.id) {
          setSelectedCanvasItemId(payloads[0].id);
        }
        broadcastCanvasCmsUpdate(localRes.items, payloads[0]?.id);
        toast.success(
          `Added ${payloads.length} ${payloads.length === 1 ? "item" : "items"} to Canvas!`,
        );
      } catch (err) {
        console.error("Drop upload failed:", err);
        toast.error("Failed to upload dropped files");
      } finally {
        setSyncing(false);
        setUploadingFilesMessage(null);
      }
    },
    [],
  );

  // Replace an existing item's media when a file is dropped directly onto its card
  const handleReplaceCardMediaByDrop = useCallback(
    async (targetItem: PortfolioCanvasProject, file: File) => {
      setSyncing(true);
      setUploadingFilesMessage(`Updating "${targetItem.title}" media...`);
      try {
        const descriptors = await uploadMediaFilesToCms([file]);
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
        toast.error("Failed to replace card media");
      } finally {
        setSyncing(false);
        setUploadingFilesMessage(null);
      }
    },
    [],
  );

  // Window-level file drag listeners so dropping files anywhere on the screen works
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
      // Specific dropzones call e.stopPropagation(); if dropped anywhere else on window, handle it:
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

  // Interactive 2D Canvas Pointer Move / Up handlers for smooth 60fps dragging
  useEffect(() => {
    if (!activeCanvasDrag && !activeCanvasPanDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (activeCanvasDrag) {
        const dx = (e.clientX - activeCanvasDrag.startClientX) / canvasScale;
        const dy = (e.clientY - activeCanvasDrag.startClientY) / canvasScale;
        const nextX = Math.max(
          40,
          Math.min(CANVAS_WORLD_WIDTH - 240, Math.round(activeCanvasDrag.initialCanvasX + dx)),
        );
        const nextY = Math.max(
          40,
          Math.min(CANVAS_WORLD_HEIGHT - 240, Math.round(activeCanvasDrag.initialCanvasY + dy)),
        );
        setActiveCanvasDrag((prev) =>
          prev
            ? {
                ...prev,
                currentCanvasX: nextX,
                currentCanvasY: nextY,
              }
            : null,
        );
      } else if (activeCanvasPanDrag) {
        const dx = e.clientX - activeCanvasPanDrag.startClientX;
        const dy = e.clientY - activeCanvasPanDrag.startClientY;
        setCanvasPan({
          x: Math.round(activeCanvasPanDrag.initialPanX + dx),
          y: Math.round(activeCanvasPanDrag.initialPanY + dy),
        });
      }
    };

    const handlePointerUp = () => {
      if (activeCanvasDrag) {
        const { id, initialCanvasX, initialCanvasY, currentCanvasX, currentCanvasY } =
          activeCanvasDrag;
        setActiveCanvasDrag(null);
        if (currentCanvasX !== initialCanvasX || currentCanvasY !== initialCanvasY) {
          const localRes = mutateUpdateCanvasItem({
            id,
            canvasX: currentCanvasX,
            canvasY: currentCanvasY,
          });
          setItems(localRes.items);
          broadcastCanvasCmsUpdate(localRes.items, id);
          toast.success(`Locked position at X: ${currentCanvasX}, Y: ${currentCanvasY}`);
        }
      }
      if (activeCanvasPanDrag) {
        setActiveCanvasPanDrag(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeCanvasDrag, activeCanvasPanDrag, canvasScale]);

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

  const processModalSelectedFile = async (file: File) => {
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    setNewMediaType(isVideo ? "video" : "image");
    setUploadProgress("Uploading & measuring natural aspect ratio...");

    try {
      const descriptors = await uploadMediaFilesToCms([file]);
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
        setUploadProgress(null);
        toast.success(`Loaded ${file.name}`);
      }
    } catch {
      setUploadProgress(null);
      toast.error("Failed to read file");
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
      setSelectedCanvasItemId(id);
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

  // Grid Card Drag & Drop handlers (swap positions between cards or drop file onto a card)
  const handleGridCardDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    setDraggedCardId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleGridCardDragOver = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverCardId !== targetId) {
      setDragOverCardId(targetId);
    }
  };

  const handleGridCardDrop = (e: DragEvent<HTMLDivElement>, targetItem: PortfolioCanvasProject) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCardId(null);
    windowDragCounterRef.current = 0;
    setIsWindowFileDragging(false);

    // 1. Check if user dropped media file(s) from computer onto this specific card
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleReplaceCardMediaByDrop(targetItem, e.dataTransfer.files[0]);
      setDraggedCardId(null);
      return;
    }

    // 2. Otherwise check if user dragged another card onto this card to swap their Canvas (X, Y) positions
    const sourceId = draggedCardId || e.dataTransfer.getData("text/plain");
    setDraggedCardId(null);
    if (!sourceId || sourceId === targetItem.id) return;

    const sourceItem = items.find((i) => i.id === sourceId);
    const localRes = mutateSwapCanvasItemPositions(sourceId, targetItem.id);
    setItems(localRes.items);
    broadcastCanvasCmsUpdate(localRes.items, sourceId);
    toast.success(
      `Swapped canvas positions: "${sourceItem?.title ?? "Item"}" ↔ "${targetItem.title}"`,
    );
  };

  // Interactive 2D Canvas Map Pointer & Drop handlers
  const handleCanvasItemPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    item: PortfolioCanvasProject,
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelectedCanvasItemId(item.id);
    setActiveCanvasDrag({
      id: item.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialCanvasX: item.canvasX,
      initialCanvasY: item.canvasY,
      currentCanvasX: item.canvasX,
      currentCanvasY: item.canvasY,
    });
  };

  const handleCanvasBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setActiveCanvasPanDrag({
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPanX: canvasPan.x,
      initialPanY: canvasPan.y,
    });
  };

  const handleCanvasMapFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCanvasFileDropActive(false);
    windowDragCounterRef.current = 0;
    setIsWindowFileDragging(false);

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const rect = canvasViewportRef.current?.getBoundingClientRect();
    if (rect) {
      const worldX = Math.round((e.clientX - rect.left - canvasPan.x) / canvasScale);
      const worldY = Math.round((e.clientY - rect.top - canvasPan.y) / canvasScale);
      void handleDirectDropFilesUpload(e.dataTransfer.files, {
        canvasX: worldX,
        canvasY: worldY,
      });
    } else {
      void handleDirectDropFilesUpload(e.dataTransfer.files);
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
            Enter your admin passcode to access portfolio media, drag-and-drop canvas layouts, and
            dual-store sync.
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
      {/* Full-Screen Drag & Drop File Overlay */}
      {isWindowFileDragging && !isAddModalOpen && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-md">
          <div className="flex max-w-md flex-col items-center rounded-3xl border-2 border-dashed border-emerald-400/80 bg-neutral-900/95 p-10 text-center shadow-2xl">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <UploadCloud className="h-8 w-8 animate-bounce" />
            </div>
            <h2 className="font-display text-xl font-bold text-white">
              Drop Media Anywhere to Upload
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Release your images or videos anywhere on the screen (or drop onto a specific spot on
              the 2D Canvas Map) to immediately lock them into the portfolio.
            </p>
          </div>
        </div>
      )}

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
            {/* Workspace View Switcher */}
            <div className="hidden items-center rounded-xl border border-white/10 bg-black/50 p-1 md:inline-flex">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "split"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Columns className="h-3.5 w-3.5" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("canvas")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "canvas"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                <span>2D Canvas</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "grid"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
            </div>

            <button
              onClick={handleManualSyncToCode}
              disabled={syncing}
              title="Force cloud & disk sync"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-white/10 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Sync Store</span>
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
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Status / Metric Ribbon */}
        <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
              Drag & Drop Sync
            </span>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <Check className="h-4 w-4" />
              <span>Locked for 20+ Years</span>
            </div>
          </div>
        </section>

        {/* Quick Multi-File Drag & Drop Upload Banner */}
        <section className="mb-6">
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
            className={`group flex cursor-pointer flex-col items-center justify-between gap-4 rounded-2xl border-2 border-dashed p-5 transition-all sm:flex-row sm:px-6 ${
              isDropzoneActive
                ? "border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                : "border-white/15 bg-neutral-900/40 hover:border-white/35 hover:bg-neutral-900/70"
            }`}
          >
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
                  {uploadingFilesMessage ||
                    "Drag & Drop Images or Videos Here for Instant Canvas Placement"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Drop multiple files at once, drag cards on the 2D Canvas below to position them,
                  or drag one card onto another in the Grid to swap coordinates.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-foreground transition-colors group-hover:bg-white text-center group-hover:text-black">
                Browse Files
              </span>
            </div>
          </div>
        </section>

        {/* INTERACTIVE 2D CANVAS DRAG-AND-DROP EDITOR */}
        {(viewMode === "split" || viewMode === "canvas") && (
          <section className="mb-8 overflow-hidden rounded-3xl border border-white/15 bg-neutral-950 shadow-2xl">
            {/* Canvas Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-neutral-900/80 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Move className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                    Interactive 2D Canvas Drag & Drop Map
                  </h2>
                  <p className="text-[0.68rem] text-muted-foreground">
                    Drag any item to move its exact (X, Y) coordinates • Drag background to pan •
                    Drop files directly onto any spot
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeCanvasDrag && (
                  <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[0.68rem] font-semibold text-emerald-300">
                    Dragging → X: {activeCanvasDrag.currentCanvasX} · Y:{" "}
                    {activeCanvasDrag.currentCanvasY}
                  </span>
                )}

                <div className="inline-flex items-center rounded-xl border border-white/10 bg-black/50 p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCanvasScale((s) => Math.max(0.1, Number((s - 0.04).toFixed(2))))
                    }
                    title="Zoom Out"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2 font-mono text-[0.68rem] text-muted-foreground">
                    {Math.round(canvasScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCanvasScale((s) => Math.min(0.85, Number((s + 0.04).toFixed(2))))
                    }
                    title="Zoom In"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={fitCanvasToViewport}
                    title="Fit Entire Canvas"
                    className="ml-1 rounded-lg border-l border-white/10 pl-2 pr-1.5 py-1 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 2D Canvas Viewport */}
            <div
              ref={canvasViewportRef}
              onPointerDown={handleCanvasBackgroundPointerDown}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isCanvasFileDropActive) setIsCanvasFileDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsCanvasFileDropActive(false);
              }}
              onDrop={handleCanvasMapFileDrop}
              className={`relative w-full select-none overflow-hidden bg-[#070707] ${
                viewMode === "canvas" ? "h-[72vh]" : "h-[460px]"
              } ${
                activeCanvasPanDrag ? "cursor-grabbing" : "cursor-grab"
              } ${isCanvasFileDropActive ? "ring-2 ring-inset ring-emerald-400" : ""}`}
              style={{
                backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
                backgroundSize: `${Math.max(12, Math.round(80 * canvasScale))}px ${Math.max(
                  12,
                  Math.round(80 * canvasScale),
                )}px`,
                backgroundPosition: `${canvasPan.x}px ${canvasPan.y}px`,
              }}
            >
              {/* Scaled 3800 x 2700 World Surface */}
              <div
                style={{
                  width: `${CANVAS_WORLD_WIDTH}px`,
                  height: `${CANVAS_WORLD_HEIGHT}px`,
                  transform: `translate3d(${canvasPan.x}px, ${canvasPan.y}px, 0) scale(${canvasScale})`,
                  transformOrigin: "0 0",
                }}
                className="relative rounded-3xl border-2 border-dashed border-white/15 bg-neutral-950/50"
              >
                {filteredItems.map((project) => {
                  const isDraggingThis = activeCanvasDrag?.id === project.id;
                  const displayX = isDraggingThis
                    ? activeCanvasDrag.currentCanvasX
                    : project.canvasX;
                  const displayY = isDraggingThis
                    ? activeCanvasDrag.currentCanvasY
                    : project.canvasY;
                  const isSelected = selectedCanvasItemId === project.id;
                  const isVid = project.mediaType === "video" || Boolean(project.videoUrl);

                  return (
                    <div
                      key={project.id}
                      onPointerDown={(e) => handleCanvasItemPointerDown(e, project)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        openEditModal(project);
                      }}
                      style={{
                        transform: `translate3d(${displayX}px, ${displayY}px, 0)`,
                        width: `${project.width}px`,
                        height: `${project.height}px`,
                      }}
                      className={`group/canvascard absolute left-0 top-0 cursor-move overflow-hidden rounded-2xl border-2 bg-neutral-900 transition-shadow ${
                        isDraggingThis
                          ? "z-50 border-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.5)] ring-4 ring-emerald-400/30"
                          : isSelected
                            ? "z-30 border-white shadow-2xl"
                            : "z-10 border-white/20 hover:z-20 hover:border-white/70"
                      }`}
                    >
                      {isVid ? (
                        <SilentAutoPlayVideo
                          src={project.videoUrl || project.imageUrl}
                          className="pointer-events-none h-full w-full object-cover"
                        />
                      ) : (
                        <MediaImage
                          src={project.imageUrl}
                          alt={project.title}
                          maxRenderDimension={360}
                          className="pointer-events-none h-full w-full object-cover"
                        />
                      )}

                      {/* Top Drag Handle Bar */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/45 to-transparent p-3">
                        <span className="line-clamp-1 font-display text-sm font-bold text-white drop-shadow">
                          {project.title}
                        </span>
                        <span className="rounded-md bg-black/75 px-2 py-0.5 font-mono text-xs text-emerald-400">
                          {displayX}, {displayY}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

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
              title="Refresh from store"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Project Grid (Supports Drag & Drop to Swap Positions or Drop File to Replace Media) */}
        {viewMode !== "canvas" && (
          <>
            {filteredItems.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-neutral-900/30 p-12 text-center">
                <p className="text-sm text-muted-foreground">No projects matching your filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredItems.map((project) => {
                  const isVid = project.mediaType === "video" || Boolean(project.videoUrl);
                  const isBeingDragged = draggedCardId === project.id;
                  const isDragTarget =
                    dragOverCardId === project.id && draggedCardId !== project.id;

                  return (
                    <div
                      key={project.id}
                      draggable
                      onDragStart={(e) => handleGridCardDragStart(e, project.id)}
                      onDragOver={(e) => handleGridCardDragOver(e, project.id)}
                      onDragLeave={() => {
                        if (dragOverCardId === project.id) setDragOverCardId(null);
                      }}
                      onDrop={(e) => handleGridCardDrop(e, project)}
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
                      {/* Drop Target Highlight Badge */}
                      {isDragTarget && (
                        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-emerald-950/75 p-4 text-center backdrop-blur-xs">
                          <span className="rounded-xl border border-emerald-400/50 bg-black/80 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                            {draggedCardId
                              ? "Drop to Swap Canvas Position"
                              : "Drop File to Replace Media"}
                          </span>
                        </div>
                      )}

                      {/* Thumbnail / Media Preview */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/80">
                        {isVid ? (
                          <SilentAutoPlayVideo
                            src={project.videoUrl || project.imageUrl}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <MediaImage
                            src={project.imageUrl}
                            alt={project.title}
                            maxRenderDimension={420}
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

                        {/* Drag Grip Badge */}
                        <div
                          title="Drag card to swap canvas position or drop a file here to replace media"
                          className="absolute right-2.5 top-2.5 z-10 flex items-center gap-0.5 rounded-md bg-black/75 px-1.5 py-1 text-[0.6rem] text-muted-foreground backdrop-blur-md transition-colors group-hover:text-white"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
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
          </>
        )}
      </main>

      {/* ADD ITEM MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-foreground">Add Canvas Project</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag & drop an image/video below, browse your computer, or paste a URL.
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
                  <span>Drag & Drop Image or Video Here, or Click to Browse</span>
                </div>
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
