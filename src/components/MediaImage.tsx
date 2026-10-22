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

function getSharedVideoObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
    return null;
  }
  if (!sharedVideoObserver) {
    sharedVideoObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            video.defaultMuted = true;
            video.muted = true;
            if (video.paused) {
              const p = video.play();
              if (p && typeof p.catch === "function") {
                p.catch(() => {});
              }
            }
          } else if (!video.paused) {
            video.pause();
          }
        }
      },
      {
        rootMargin: "500px",
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
  const isCmsLocal = Boolean(key && key.startsWith("cms-"));

  const [state, setState] = useState<{ url: string; isResolving: boolean }>(() => {
    if (!normalized) return { url: "", isResolving: false };
    if (isCmsLocal) {
      // Wait for IndexedDB lookup before firing any network request for cms-* keys
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
      setState({ url: immediate, isResolving: false });
      return;
    }

    if (!key) {
      setState({ url: normalized, isResolving: false });
      return;
    }

    if (isCmsLocal) {
      setState((prev) => (prev.url ? prev : { url: "", isResolving: true }));
    } else {
      setState({ url: normalized, isResolving: false });
    }

    let active = true;
    void getMediaObjectUrlFromIdb(key).then((blobUrl) => {
      if (!active) return;
      if (blobUrl) {
        setState({ url: blobUrl, isResolving: false });
      } else {
        setState({ url: normalized, isResolving: false });
      }
    });

    return () => {
      active = false;
    };
  }, [normalized, key, isCmsLocal]);

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
      if (prev && prev !== node && observedVideos.has(prev)) {
        getSharedVideoObserver()?.unobserve(prev);
        observedVideos.delete(prev);
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
          } else {
            const playPromise = node.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch(() => {});
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
      if (node && observedVideos.has(node)) {
        getSharedVideoObserver()?.unobserve(node);
        observedVideos.delete(node);
      }
    };
  }, []);

  if (isResolving || !activeVideoSrc) {
    return (
      <div
        aria-hidden="true"
        className={cn("min-h-[120px] min-w-[120px] animate-pulse bg-white/[0.04]", className)}
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
      autoPlay={!pausedPreview}
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
        if (!pausedPreview) {
          const playPromise = node.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
        }
        props.onLoadedData?.(e);
      }}
      onError={(e) => {
        const key = extractMediaKeyFromUrl(src);
        if (key && !activeVideoSrc.startsWith("blob:")) {
          void getMediaObjectUrlFromIdb(key).then((blobUrl) => {
            if (blobUrl && blobUrl !== activeVideoSrc) {
              setOverrideSrc(blobUrl);
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
        className={cn("min-h-[120px] min-w-[120px] animate-pulse bg-white/[0.04]", className)}
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
        if (key && !activeVideoSrc.startsWith("blob:")) {
          void getMediaObjectUrlFromIdb(key).then((blobUrl) => {
            if (blobUrl && blobUrl !== activeVideoSrc) {
              setOverrideSrc(blobUrl);
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
  const [currentSrc, setCurrentSrc] = useState(preferredSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(
      maxRenderDimension ? getOptimizedMediaUrl(resolvedSrc, maxRenderDimension) : resolvedSrc,
    );
    setFailed(false);
  }, [resolvedSrc, maxRenderDimension]);

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
        className={cn("min-h-[80px] min-w-[80px] animate-pulse bg-white/[0.04]", className)}
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
      loading={props.loading ?? "lazy"}
      decoding="async"
      className={className}
      onLoad={(e) => {
        setFailed(false);
        onLoad?.(e);
      }}
      onError={(event: SyntheticEvent<HTMLImageElement, Event>) => {
        if (currentSrc !== resolvedSrc && resolvedSrc) {
          setCurrentSrc(resolvedSrc);
          return;
        }
        const key = extractMediaKeyFromUrl(src);
        if (key && !currentSrc.startsWith("blob:")) {
          void getMediaObjectUrlFromIdb(key).then((blobUrl) => {
            if (blobUrl && blobUrl !== currentSrc) {
              setCurrentSrc(blobUrl);
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
