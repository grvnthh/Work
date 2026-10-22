const items = [
  "Graphic Design",
  "Video Editing",
  "Brand Identity",
  "Motion Graphics",
  "Social Media",
  "Thumbnails",
  "Reels & Shorts",
  "Logo Design",
];

export function Marquee() {
  const row = [...items, ...items];
  return (
    <div className="marquee-mask relative border-y border-white/10 bg-background/30 py-7 backdrop-blur-sm">
      <div className="flex w-max animate-marquee gap-12 whitespace-nowrap">
        {row.map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-12 font-display text-3xl font-semibold tracking-tight text-muted-foreground sm:text-4xl"
          >
            <span className="italic transition-colors duration-500 hover:text-foreground">{t}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
