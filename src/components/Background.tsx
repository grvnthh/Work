import { useEffect, useState } from "react";

let cachedNoiseDataUrl: string | null = null;

function getNoiseDataUrl(): string {
  if (cachedNoiseDataUrl) return cachedNoiseDataUrl;
  if (typeof document === "undefined") return "";
  try {
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() > 0.5 ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 14;
    }
    ctx.putImageData(imgData, 0, 0);
    cachedNoiseDataUrl = canvas.toDataURL("image/png");
    return cachedNoiseDataUrl;
  } catch {
    return "";
  }
}

export function Background() {
  const [noiseUrl, setNoiseUrl] = useState<string>("");

  useEffect(() => {
    setNoiseUrl(getNoiseDataUrl());
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* base vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.07),transparent_60%)]" />

      {/* aurora orbs — painted as soft radial gradients (no filter: blur) so they
          stay cheap to composite while animating */}
      <div
        className="orb absolute -top-40 -left-40 h-[620px] w-[620px] animate-aurora"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%)",
        }}
      />
      <div
        className="orb absolute top-1/3 -right-40 h-[520px] w-[520px] animate-drift"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.09), rgba(255,255,255,0) 70%)",
          animationDelay: "-6s",
        }}
      />
      <div
        className="orb absolute bottom-0 left-1/3 h-[520px] w-[520px] animate-aurora"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.07), rgba(255,255,255,0) 70%)",
          animationDelay: "-10s",
        }}
      />

      {/* subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      {/* pre-baked bitmap grain — zero SVG feTurbulence or blend-mode overhead */}
      {noiseUrl && (
        <div
          className="grain-layer absolute inset-0"
          style={{
            backgroundImage: `url(${noiseUrl})`,
            backgroundRepeat: "repeat",
            backgroundSize: "96px 96px",
          }}
        />
      )}
    </div>
  );
}
