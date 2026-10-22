import type { ImgHTMLAttributes, SyntheticEvent, VideoHTMLAttributes } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  extractMediaKeyFromUrl,
  getCachedObjectUrlForMedia,
  getMediaObjectUrlFromIdb,
  normalizeCmsMediaUrl,
} from "@/lib/cms-storage";
import { cn } from "@/lib/utils";

const VIDEO_EXTENSION_REGEX = /\.(mp4|webm|mov|m4v|mkv|avi|ogg|ogv)(?:[?#&]|$)/i;

const AVAILABLE_THUMB_FILES = new Set([
  "demo-thumbnail-16x9.webp",
  "reel-cover-1.webp",
  "reel-cover-2.webp",
  "reel-cover-3.webp",
  "showcase-album-2.webp",
  "showcase-album-3.webp",
  "showcase-flyer-1.webp",
  "showcase-flyer-6.webp",
  "showcase-logo-12.webp",
  "showcase-logo-14.webp",
  "showcase-logo-16.webp",
  "showcase-logo-18-noxx.webp",
  "showcase-logo-18-yurane.webp",
  "showcase-logo-19-grab-gadgets.webp",
  "showcase-logo-21-create-for-me.webp",
  "showcase-logo-23-make-the-vibes.webp",
  "showcase-logo-24-leader-lessons.webp",
  "showcase-logo-25-gradient-mark.webp",
  "showcase-logo-6.webp",
  "showcase-logo-8.webp",
  "showcase-poster-13.webp",
  "showcase-poster-14.webp",
  "showcase-poster-15.webp",
  "showcase-poster-17.webp",
  "showcase-poster-18.webp",
]);

// Single shared IntersectionObserver to automatically play videos only when near/in viewport
// and pause offscreen videos so the browser never decodes dozens of hidden streams at once.
let sharedVideoObserver: IntersectionObserver | null = null;
const observedVideos = new WeakSet<HTMLVideoElement>();
const activePlayingVideos = new Set<HTMLVideoElement>();
const MAX_CONCURRENT_CANVAS_VIDEOS = 6;

function getSharedVideoObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
    return null;
  }
  if (!sharedVideoObserver) {
    sharedVideoObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (!entry.isIntersecting) {
            activePlayingVideos.delete(video);
            if (!video.paused) {
              video.pause();
            }
          }
        }
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            video.defaultMuted = true;
            video.muted = true;
            if (
              video.paused &&
              (activePlayingVideos.has(video) ||
                activePlayingVideos.size < MAX_CONCURRENT_CANVAS_VIDEOS)
            ) {
              activePlayingVideos.add(video);
              const p = video.play();
              if (p && typeof p.catch === "function") {
                p.catch(() => {
                  activePlayingVideos.delete(video);
                });
              }
            }
          }
        }
      },
      {
        rootMargin: "200px",
        threshold: 0.01,
      },
    );
  }
  return sharedVideoObserver;
}

export function isVideoSource(src?: string | null): boolean {
  if (!src) return false;
  return (
    VIDEO_EXTENSION_REGEX.test(src) ||
    src.startsWith("data:video/") ||
    src.includes("mimeType=video")
  );
}

function useResolvedMediaState(src?: string | null): { url: string; isResolving: boolean } {
  const normalized = normalizeCmsMediaUrl(src);
  const key = extractMediaKeyFromUrl(normalized);
  const needsAsyncResolution = Boolean(
    key && (normalized.includes("local=") || normalized.includes("inquiry=")),
  );
  const isUnresolvedLocalCmsUrl = Boolean(
    key && key.startsWith("cms-") && normalized.includes("local="),
  );

  const [state, setState] = useState<{ url: string; isResolving: boolean }>(() => {
    if (!normalized) return { url: "", isResolving: false };
    const immediate = getCachedObjectUrlForMedia(normalized);
    if (immediate) return { url: immediate, isResolving: false };
    if (isUnresolvedLocalCmsUrl) {
      return { url: "", isResolving: true };
    }
    return { url: normalized, isResolving: false };
  });

  useEffect(() => {
    if (!normalized) {
      setState({ url: "", isResolving: false });
      return;
    }

    const immediate = getCachedObjectUrlForMedia(normalized);
    if (immediate) {
      setState((prev) =>
        prev.url === immediate && !prev.isResolving ? prev : { url: immediate, isResolving: false },
      );
      return;
    }

    // If this is already a direct https:// signed URL, /media/ asset, blob:, or data: URL,
    // use it directly and NEVER trigger IndexedDB / Cloud lookups or swap src mid-download.
    if (!key || !needsAsyncResolution) {
      setState((prev) =>
        prev.url === normalized && !prev.isResolving
          ? prev
          : { url: normalized, isResolving: false },
      );
      return;
    }

    // If this is a local=/api/drive-media URL whose IndexedDB/Cloud URL is not yet in memory cache,
    // wait for IndexedDB/Cloud resolution first so the browser never fires a doomed 404 on Frame 0.
    if (isUnresolvedLocalCmsUrl) {
      setState((prev) => (prev.isResolving ? prev : { url: "", isResolving: true }));
    } else {
      setState((prev) =>
        prev.url === normalized && !prev.isResolving
          ? prev
          : { url: normalized, isResolving: false },
      );
    }

    let active = true;
    void getMediaObjectUrlFromIdb(key).then((resolvedUrl) => {
      if (!active) return;
      if (resolvedUrl) {
        setState((prev) => {
          if (prev.url === resolvedUrl && !prev.isResolving) return prev;
          return { url: resolvedUrl, isResolving: false };
        });
      } else {
        setState((prev) =>
          prev.url === normalized && !prev.isResolving
            ? prev
            : { url: normalized, isResolving: false },
        );
      }
    });

    return () => {
      active = false;
    };
  }, [normalized, key, needsAsyncResolution, isUnresolvedLocalCmsUrl]);

  return state;
}

export function useResolvedMediaUrl(src?: string | null): string {
  const { url } = useResolvedMediaState(src);
  return url;
}

export interface SilentAutoPlayVideoProps extends Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  "src" | "muted" | "autoPlay"
> {
  src: string;
  poster?: string;
  alt?: string;
  pausedPreview?: boolean;
  onVideoError?: () => void;
}

/**
 * Renders an HTML5 video that automatically plays silently in a loop when visible in viewport.
 */
export const SilentAutoPlayVideo = memo(function SilentAutoPlayVideo({
  src,
  poster,
  alt,
  className,
  loop = true,
  playsInline = true,
  preload = "metadata",
  pausedPreview = false,
  onVideoError,
  ...props
}: SilentAutoPlayVideoProps) {
  const { url: resolvedSrc, isResolving } = useResolvedMediaState(src);
  const { url: resolvedPoster } = useResolvedMediaState(poster);
  const [overrideSrc, setOverrideSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  const activeVideoSrc = overrideSrc || resolvedSrc;

  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      const prev = videoRef.current;
      if (prev && prev !== node) {
        activePlayingVideos.delete(prev);
        if (observedVideos.has(prev)) {
          getSharedVideoObserver()?.unobserve(prev);
          observedVideos.delete(prev);
        }
      }

      videoRef.current = node;
      if (node) {
        node.defaultMuted = true;
        node.muted = true;
        node.playsInline = true;
        if (!pausedPreview) {
          const obs = getSharedVideoObserver();
          if (obs) {
            obs.observe(node);
            observedVideos.add(node);
          } else if (activePlayingVideos.size < MAX_CONCURRENT_CANVAS_VIDEOS) {
            activePlayingVideos.add(node);
            const playPromise = node.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch(() => {
                activePlayingVideos.delete(node);
              });
            }
          }
        }
      }
    },
    [pausedPreview],
  );

  useEffect(() => {
    setOverrideSrc(null);
    setFailed(false);
    const node = videoRef.current;
    if (!node) return;
    node.defaultMuted = true;
    node.muted = true;
    node.playsInline = true;
    if (pausedPreview) {
      activePlayingVideos.delete(node);
      node.pause();
      return;
    }
    const obs = getSharedVideoObserver();
    if (obs && !observedVideos.has(node)) {
      obs.observe(node);
      observedVideos.add(node);
    }
  }, [resolvedSrc, pausedPreview]);

  useEffect(() => {
    return () => {
      const node = videoRef.current;
      if (node) {
        activePlayingVideos.delete(node);
        if (observedVideos.has(node)) {
          getSharedVideoObserver()?.unobserve(node);
          observedVideos.delete(node);
        }
      }
    };
  }, []);

  if (isResolving || !activeVideoSrc) {
    return (
      <div
        aria-hidden="true"
        className={cn("min-h-[120px] min-w-[120px] bg-white/[0.04]", className)}
      />
    );
  }

  if (failed) {
    if (resolvedPoster && !isVideoSource(poster)) {
      return (
        <img
          src={resolvedPoster}
          alt={alt ?? "Video preview"}
          className={className}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      );
    }
    return (
      <div
        role="img"
        aria-label={alt ?? "Video unavailable"}
        className={cn(
          "flex items-center justify-center bg-muted/30 px-4 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        <span>Media unavailable</span>
      </div>
    );
  }

  const safePoster =
    resolvedPoster && !isVideoSource(poster)
      ? getOptimizedMediaUrl(resolvedPoster, 720)
      : undefined;

  return (
    <video
      {...props}
      ref={setVideoNode}
      src={activeVideoSrc}
      poster={safePoster}
      aria-label={alt}
      muted
      loop={loop}
      playsInline={playsInline}
      preload={preload}
      draggable={props.draggable ?? false}
      onDragStart={(e) => {
        e.preventDefault();
        props.onDragStart?.(e);
      }}
      className={className}
      onLoadedData={(e) => {
        setFailed(false);
        const node = e.currentTarget;
        node.defaultMuted = true;
        node.muted = true;
        if (
          !pausedPreview &&
          (activePlayingVideos.has(node) || activePlayingVideos.size < MAX_CONCURRENT_CANVAS_VIDEOS)
        ) {
          activePlayingVideos.add(node);
          const playPromise = node.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {
              activePlayingVideos.delete(node);
            });
          }
        }
        props.onLoadedData?.(e);
      }}
      onError={(e) => {
        const key = extractMediaKeyFromUrl(src);
        if (key) {
          void getMediaObjectUrlFromIdb(key, true).then((freshUrl) => {
            if (freshUrl && freshUrl !== activeVideoSrc) {
              setOverrideSrc(freshUrl);
              setFailed(false);
            } else {
              setFailed(true);
              onVideoError?.();
            }
          });
        } else {
          setFailed(true);
          onVideoError?.();
        }
        props.onError?.(e);
      }}
    />
  );
});

export interface InteractiveVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> {
  src: string;
  poster?: string;
  alt?: string;
  playImmediatelyWithSound?: boolean;
  onVideoError?: () => void;
}

/**
 * Renders an HTML5 video for the preview modal that plays with sound.
 */
export function InteractiveVideo({
  src,
  poster,
  alt,
  className,
  playImmediatelyWithSound = false,
  onVideoError,
  ...props
}: InteractiveVideoProps) {
  const { url: resolvedSrc, isResolving } = useResolvedMediaState(src);
  const { url: resolvedPoster } = useResolvedMediaState(poster);
  const [overrideSrc, setOverrideSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  const activeVideoSrc = overrideSrc || resolvedSrc;

  const enableSound = useCallback((node: HTMLVideoElement | null) => {
    if (!node) return;
    node.defaultMuted = false;
    node.muted = false;
    node.volume = 1;
    node.playsInline = true;
  }, []);

  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node) {
        enableSound(node);
        if (playImmediatelyWithSound) {
          const playPromise = node.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {
              node.muted = true;
              node.play().catch(() => {});
            });
          }
        }
      }
    },
    [enableSound, playImmediatelyWithSound],
  );

  useEffect(() => {
    setOverrideSrc(null);
    setFailed(false);
  }, [resolvedSrc]);

  if (isResolving || !activeVideoSrc) {
    return (
      <div
        aria-hidden="true"
        className={cn("min-h-[120px] min-w-[120px] bg-white/[0.04]", className)}
      />
    );
  }

  if (failed) {
    if (resolvedPoster && !isVideoSource(poster)) {
      return (
        <img
          src={resolvedPoster}
          alt={alt ?? "Video preview"}
          className={className}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      );
    }
    return (
      <div
        role="img"
        aria-label={alt ?? "Video unavailable"}
        className={cn(
          "flex items-center justify-center bg-muted/30 px-4 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        <span>Media unavailable</span>
      </div>
    );
  }

  const safePoster = resolvedPoster && !isVideoSource(poster) ? resolvedPoster : undefined;

  return (
    <video
      {...props}
      ref={setVideoNode}
      src={activeVideoSrc}
      poster={safePoster}
      aria-label={alt}
      playsInline
      preload={props.preload ?? "auto"}
      className={className}
      onError={(e) => {
        const key = extractMediaKeyFromUrl(src);
        if (key) {
          void getMediaObjectUrlFromIdb(key, true).then((freshUrl) => {
            if (freshUrl && freshUrl !== activeVideoSrc) {
              setOverrideSrc(freshUrl);
              setFailed(false);
            } else {
              setFailed(true);
              onVideoError?.();
            }
          });
        } else {
          setFailed(true);
          onVideoError?.();
        }
        props.onError?.(e);
      }}
    />
  );
}

export interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  /** Optional max pixel dimension for Retina mipmap caching on small cards (e.g. 720) */
  maxRenderDimension?: number;
}

export function getOptimizedMediaUrl(src?: string | null, maxDimension?: number): string {
  if (!src) return "";
  if (!maxDimension || maxDimension > 1200) return src;
  if (src.startsWith("/media/") && !src.startsWith("/media/thumbs/")) {
    const filename = src.slice("/media/".length).split("?")[0];
    const thumbName = filename.replace(/\.[^.]+$/, "") + ".webp";
    if (AVAILABLE_THUMB_FILES.has(thumbName)) {
      return `/media/thumbs/${thumbName}`;
    }
  }
  return src;
}

export const MediaImage = memo(function MediaImage({
  src,
  alt,
  className,
  maxRenderDimension,
  onLoad,
  onError,
  ...props
}: MediaImageProps) {
  const { url: resolvedSrc, isResolving } = useResolvedMediaState(src);
  const preferredSrc = maxRenderDimension
    ? getOptimizedMediaUrl(resolvedSrc, maxRenderDimension)
    : resolvedSrc;
  const [overrideSrc, setOverrideSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const currentSrc = overrideSrc || preferredSrc;

  useEffect(() => {
    setOverrideSrc(null);
    setFailed(false);
  }, [preferredSrc]);

  if (!failed && isVideoSource(src)) {
    return (
      <SilentAutoPlayVideo
        src={src}
        alt={alt}
        className={className}
        draggable={props.draggable}
        onVideoError={() => setFailed(true)}
      />
    );
  }

  if (isResolving || !currentSrc) {
    return (
      <div
        aria-hidden="true"
        className={cn("min-h-[80px] min-w-[80px] bg-white/[0.04]", className)}
      />
    );
  }

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-center bg-muted/30 px-4 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        <span>Media unavailable</span>
      </div>
    );
  }

  const effectiveLoading = props.loading ?? "lazy";
  const effectiveDecoding = props.decoding ?? "async";

  return (
    <img
      {...props}
      src={currentSrc}
      alt={alt}
      draggable={props.draggable ?? false}
      onDragStart={(e) => {
        e.preventDefault();
        props.onDragStart?.(e);
      }}
      loading={effectiveLoading}
      decoding={effectiveDecoding}
      className={className}
      onLoad={(e) => {
        setFailed(false);
        onLoad?.(e);
      }}
      onError={(event: SyntheticEvent<HTMLImageElement, Event>) => {
        if (currentSrc !== resolvedSrc && resolvedSrc) {
          setOverrideSrc(resolvedSrc);
          return;
        }
        const key = extractMediaKeyFromUrl(src);
        if (key) {
          void getMediaObjectUrlFromIdb(key, true).then((freshUrl) => {
            if (freshUrl && freshUrl !== currentSrc) {
              setOverrideSrc(freshUrl);
              setFailed(false);
            } else {
              setFailed(true);
              onError?.(event);
            }
          });
        } else {
          setFailed(true);
          onError?.(event);
        }
      }}
    />
  );
});
