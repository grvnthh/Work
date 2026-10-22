import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const budgets = ["< ₹10k", "₹10k – ₹50k", "₹50k – ₹1L", "₹1L+", "Let's discuss"];

const RECIPIENT = "work@grvnth.xyz";
const WHATSAPP = "919549946123";

type Method = "whatsapp" | "email";

export interface AttachedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  uploading: boolean;
  url?: string;
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function inferMimeType(file: File): string {
  if (file.type && file.type.trim()) {
    return file.type;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "mkv":
      return "video/x-matroska";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "ogg":
    case "ogv":
      return "video/ogg";
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

function makeUniqueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeStorageFileName(name: string): string {
  const trimmed = name.trim() || "attachment";
  const dotIndex = trimmed.lastIndexOf(".");
  const rawBase = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  const rawExt = dotIndex > 0 ? trimmed.slice(dotIndex).toLowerCase() : "";
  const safeExt = rawExt.replace(/[^.a-z0-9]/g, "").slice(0, 12);
  const safeBase =
    rawBase
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "attachment";
  return `${safeBase}${safeExt}`;
}

function resolveAbsoluteUrl(uploadedPath: string): string {
  if (/^https?:\/\//i.test(uploadedPath)) {
    return uploadedPath;
  }
  return new URL(uploadedPath, window.location.origin).toString();
}

const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB chunks avoid proxy body limits
const SUPABASE_DIRECT_MAX_BYTES = 48 * 1024 * 1024; // 48 MB direct upload threshold

async function uploadSingleAttachment(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const mimeType = inferMimeType(file);
  const safeName = sanitizeStorageFileName(file.name);

  // 1. Direct Supabase Storage `contact-attachments` bucket with signed URL
  const hasSupabaseConfig = Boolean(
    import.meta.env["VITE_SUPABASE_URL"] && import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  );

  if (hasSupabaseConfig && file.size <= SUPABASE_DIRECT_MAX_BYTES) {
    try {
      onProgress?.(20);
      const storagePath = `inquiries/${makeUniqueId()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("contact-attachments")
        .upload(storagePath, file, {
          contentType: mimeType,
          upsert: true,
        });

      if (!uploadError) {
        onProgress?.(90);
        const { data: signed30d, error: err30d } = await supabase.storage
          .from("contact-attachments")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 30);

        if (!err30d && signed30d?.signedUrl) {
          onProgress?.(100);
          return signed30d.signedUrl;
        }

        const { data: signed7d, error: err7d } = await supabase.storage
          .from("contact-attachments")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

        if (!err7d && signed7d?.signedUrl) {
          onProgress?.(100);
          return signed7d.signedUrl;
        }
      }
    } catch {
      // Fall through to server-side chunked upload
    }
  }

  // 2. Chunked binary stream upload to /api/drive-media (supports unlimited file sizes)
  if (file.size > CHUNK_SIZE_BYTES) {
    try {
      const uploadId = makeUniqueId();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);
      let finalUrl = "";

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
        const chunkBlob = file.slice(start, end, mimeType);

        const response = await fetch(
          `/api/drive-media?purpose=inquiry&uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}&filename=${encodeURIComponent(safeName)}`,
          {
            method: "POST",
            headers: {
              "x-file-name": encodeURIComponent(safeName),
              "x-file-type": mimeType,
            },
            body: chunkBlob,
          },
        );

        if (!response.ok) {
          throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          partial?: boolean;
          files?: Array<{ url?: string }>;
        };

        onProgress?.(Math.min(99, Math.round(((chunkIndex + 1) / totalChunks) * 100)));

        const uploadedPath = payload.files?.[0]?.url;
        if (uploadedPath) {
          finalUrl = resolveAbsoluteUrl(uploadedPath);
        }
      }

      if (finalUrl) {
        onProgress?.(100);
        return finalUrl;
      }
    } catch {
      // Fall through to single-pass upload
    }
  }

  // 3. Single-pass binary stream upload to /api/drive-media
  try {
    onProgress?.(35);
    const response = await fetch(
      `/api/drive-media?purpose=inquiry&filename=${encodeURIComponent(safeName)}`,
      {
        method: "POST",
        headers: {
          "x-file-name": encodeURIComponent(safeName),
          "x-file-type": mimeType,
        },
        body: file,
      },
    );

    if (response.ok) {
      const payload = (await response.json()) as {
        files?: Array<{ url?: string }>;
      };
      const uploadedPath = payload.files?.[0]?.url;
      if (uploadedPath) {
        onProgress?.(100);
        return resolveAbsoluteUrl(uploadedPath);
      }
    }
  } catch {
    // Fall through to FormData POST
  }

  // 4. Multipart FormData POST fallback
  try {
    onProgress?.(60);
    const formData = new FormData();
    formData.append("purpose", "inquiry");
    formData.append("file", file, safeName);

    const response = await fetch("/api/drive-media?purpose=inquiry", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        files?: Array<{ url?: string }>;
      };
      const uploadedPath = payload.files?.[0]?.url;
      if (uploadedPath) {
        onProgress?.(100);
        return resolveAbsoluteUrl(uploadedPath);
      }
    }
  } catch {
    // Exhausted
  }

  throw new Error("Unable to upload attachment");
}

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", budget: budgets[1], message: "" });
  const [method, setMethod] = useState<Method>("whatsapp");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);

  // Unlimited Multi-File Attachments State
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeUploadsRef = useRef<Map<string, Promise<string>>>(new Map());

  function triggerFileSelect() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function removeAttachment(id: string) {
    activeUploadsRef.current.delete(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.attachments;
      return next;
    });
  }

  function uploadFileItem(target: AttachedFile) {
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === target.id
          ? { ...a, uploading: true, error: undefined, progress: Math.max(a.progress, 10) }
          : a,
      ),
    );

    const uploadPromise = uploadSingleAttachment(target.file, (pct) => {
      setAttachments((prev) => prev.map((a) => (a.id === target.id ? { ...a, progress: pct } : a)));
    });

    activeUploadsRef.current.set(target.id, uploadPromise);

    uploadPromise
      .then((url) => {
        activeUploadsRef.current.delete(target.id);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === target.id
              ? { ...a, url, progress: 100, uploading: false, error: undefined }
              : a,
          ),
        );
      })
      .catch((err) => {
        activeUploadsRef.current.delete(target.id);
        console.error("Attachment upload error:", err);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === target.id
              ? {
                  ...a,
                  uploading: false,
                  error: "Upload failed. Click retry.",
                }
              : a,
          ),
        );
      });
  }

  function handleAddFiles(newFileList: FileList | File[] | null) {
    if (!newFileList || newFileList.length === 0) return;
    const rawFiles = Array.from(newFileList).filter((f) => f && f.name.trim() && f.size > 0);
    if (rawFiles.length === 0) return;

    setErrors((prev) => {
      const next = { ...prev };
      delete next.attachments;
      return next;
    });

    const newItems: AttachedFile[] = rawFiles.map((file) => ({
      id: makeUniqueId(),
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      uploading: true,
    }));

    setAttachments((prev) => [...prev, ...newItems]);

    // Start concurrent uploads for newly added files
    for (const item of newItems) {
      uploadFileItem(item);
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Please enter your name";
    else if (form.name.length > 100) e.name = "Name too long";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    if (!form.message.trim()) e.message = "Tell me a bit about the project";
    else if (form.message.length > 2000) e.message = "Message too long";

    const hasFailedUploads = attachments.some((a) => a.error && !a.uploading);
    if (hasFailedUploads) {
      e.attachments = "Some files could not be uploaded. Please retry or remove them.";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setErrors({});
    setSubmitting(true);

    try {
      // 1. Wait for any in-flight uploads to complete
      const inFlightIds = attachments.filter((a) => a.uploading).map((a) => a.id);
      if (inFlightIds.length > 0) {
        const promises = inFlightIds
          .map((id) => activeUploadsRef.current.get(id))
          .filter(Boolean) as Promise<string>[];
        if (promises.length > 0) {
          await Promise.allSettled(promises);
        }
      }

      // 2. Collect resolved URLs
      const readyAttachments = attachments.filter((a) => a.url);

      const subject = `New project enquiry from ${form.name}`;
      const lines = [
        `Name: ${form.name}`,
        `Email: ${form.email}`,
        `Budget: ${form.budget}`,
        "",
        "Message:",
        form.message,
      ];

      if (readyAttachments.length > 0) {
        lines.push("");
        lines.push(
          `Attached Media (${readyAttachments.length} ${readyAttachments.length === 1 ? "file" : "files"}):`,
        );
        readyAttachments.forEach((att, idx) => {
          lines.push(`${idx + 1}. ${att.name} (${formatFileSize(att.size)}): ${att.url}`);
        });
      }

      if (method === "whatsapp") {
        const text = [subject, "", ...lines].join("\n");
        const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
        setSubmittedUrl(url);
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const url = `mailto:${RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
        setSubmittedUrl(url);
        window.location.href = url;
      }
      setSent(true);
    } catch (err) {
      console.error("Form submit error:", err);
      setErrors({ attachments: "Unable to process attachments. Please retry." });
    } finally {
      setSubmitting(false);
    }
  }

  const anyUploading = attachments.some((a) => a.uploading);
  const totalAttachmentBytes = attachments.reduce((acc, curr) => acc + curr.size, 0);

  const field =
    "w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-white/30 focus:bg-white/[0.06]";

  return (
    <form onSubmit={onSubmit} className="glass rounded-3xl p-6 sm:p-8">
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 text-center"
          >
            <div className="glass-strong mb-5 flex h-14 w-14 items-center justify-center rounded-2xl">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-display text-2xl">
              {method === "whatsapp" ? "Opening WhatsApp…" : "Message ready to send"}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {method === "whatsapp"
                ? "WhatsApp just opened with your message pre-filled. Hit send and I'll reply within 24 hours."
                : "Your email app just opened with everything filled in. Hit send and I'll get back to you within 24 hours."}
            </p>
            {submittedUrl && (
              <a
                href={submittedUrl}
                target={method === "whatsapp" ? "_blank" : undefined}
                rel={method === "whatsapp" ? "noopener noreferrer" : undefined}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-5 py-2.5 text-xs font-medium tracking-wide text-foreground transition hover:border-white/40 hover:bg-white/[0.12]"
              >
                {method === "whatsapp" ? "Open WhatsApp" : "Open Email App"}
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setSubmittedUrl(null);
                setForm({ name: "", email: "", budget: budgets[1], message: "" });
                setAttachments([]);
                setErrors({});
              }}
              className="mt-6 text-xs uppercase tracking-[0.3em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Send another
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="cf-name"
                  className="mb-2 block text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground"
                >
                  Name
                </label>
                <input
                  id="cf-name"
                  name="name"
                  className={field}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name"
                  maxLength={100}
                />
                {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
              </div>
              <div>
                <label
                  htmlFor="cf-email"
                  className="mb-2 block text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground"
                >
                  Email
                </label>
                <input
                  id="cf-email"
                  name="email"
                  className={field}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@domain.com"
                  maxLength={255}
                />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                Budget
              </label>
              <div className="flex flex-wrap gap-2">
                {budgets.map((b) => (
                  <button
                    type="button"
                    key={b}
                    onClick={() => setForm({ ...form, budget: b })}
                    className={`rounded-full border px-4 py-2 text-xs tracking-wide transition ${
                      form.budget === b
                        ? "border-white/40 bg-white/[0.08] text-foreground"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-foreground"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="cf-message"
                className="mb-2 block text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground"
              >
                Message
              </label>
              <textarea
                id="cf-message"
                name="message"
                className={`${field} min-h-32 resize-y`}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Tell me about your project, timeline, and goals…"
                maxLength={2000}
              />
              {errors.message && <p className="mt-1 text-xs text-red-400">{errors.message}</p>}
            </div>

            {/* Unlimited Multi-File Attachment Upload Area */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="cf-attachment"
                  className="block text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground"
                >
                  Attach media files{" "}
                  <span className="normal-case tracking-normal text-muted-foreground/60">
                    (optional · upload multiple with no limit)
                  </span>
                </label>
                {attachments.length > 0 && (
                  <span className="text-[0.65rem] font-mono text-muted-foreground">
                    {attachments.length} {attachments.length === 1 ? "file" : "files"} (
                    {formatFileSize(totalAttachmentBytes)})
                  </span>
                )}
              </div>

              {/* Hidden file input supporting multiple files with no limits */}
              <input
                ref={fileInputRef}
                id="cf-attachment"
                name="attachment"
                type="file"
                multiple
                onClick={(e) => {
                  e.currentTarget.value = "";
                }}
                onChange={(e) => {
                  handleAddFiles(e.target.files);
                }}
                className="hidden"
              />

              {/* Drop / Select Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setIsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(false);
                  handleAddFiles(e.dataTransfer.files);
                }}
                onClick={triggerFileSelect}
                className={`relative flex flex-col items-center justify-center rounded-2xl border border-dashed p-5 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? "border-white/50 bg-white/[0.08] ring-2 ring-white/20"
                    : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-foreground">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                </div>
                <p className="mt-2 text-xs font-medium text-foreground">
                  Click to select or drop files here
                </p>
                <p className="mt-1 text-[0.7rem] text-muted-foreground/75">
                  Images, 4K videos, audio, PDFs, or design archives — no file size or count limits
                </p>
              </div>

              {/* Uploaded Attachments List */}
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-muted-foreground">
                          {item.file.type.startsWith("video/") ? (
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          ) : item.file.type.startsWith("image/") ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{item.name}</p>
                          <p className="text-[0.68rem] text-muted-foreground">
                            {formatFileSize(item.size)}
                            {item.uploading && (
                              <span className="ml-1 text-foreground/80">
                                · Uploading {item.progress}%…
                              </span>
                            )}
                            {item.url && !item.uploading && (
                              <span className="ml-1 text-emerald-400 font-medium">· Ready ✓</span>
                            )}
                            {item.error && (
                              <span className="ml-1 text-red-400">· {item.error}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {item.error && !item.uploading && (
                          <button
                            type="button"
                            onClick={() => uploadFileItem(item)}
                            className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[0.68rem] font-medium text-foreground hover:bg-white/20"
                          >
                            Retry
                          </button>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[0.68rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            Preview
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={triggerFileSelect}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <span>Add more files</span>
                    </button>
                  </div>
                </div>
              )}

              {errors.attachments && (
                <p className="mt-1.5 text-xs text-red-400">{errors.attachments}</p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                Send via
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "whatsapp", label: "WhatsApp", hint: "Recommended" },
                    { id: "email", label: "Email", hint: null },
                  ] as { id: Method; label: string; hint: string | null }[]
                ).map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs tracking-wide transition ${
                      method === m.id
                        ? "border-white/40 bg-white/[0.08] text-foreground"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-foreground"
                    }`}
                  >
                    {m.label}
                    {m.hint && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-foreground/80">
                        {m.hint}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-medium tracking-tight text-background transition hover:bg-foreground/90 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting || anyUploading
                ? "Uploading files & preparing message…"
                : method === "whatsapp"
                  ? "Send via WhatsApp"
                  : "Send via Email"}
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </motion.button>
            <p className="text-center text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground/70">
              {method === "whatsapp"
                ? "Opens WhatsApp with your message & files · replies within 24h"
                : "Opens in your email app with your message & files · replies within 24h"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
