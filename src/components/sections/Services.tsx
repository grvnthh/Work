import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  type Variants,
} from "framer-motion";
import { useRef, type MouseEvent } from "react";
import { Reveal } from "../Reveal";

const services = [
  {
    n: "01",
    t: "Graphic Design",
    d: "Bold, modern visuals that command attention across every surface.",
  },
  { n: "02", t: "Video Editing", d: "Cinematic cuts, rhythm, and pacing that hold the viewer in." },
  { n: "03", t: "Social Media Design", d: "Scroll-stopping creatives engineered for the feed." },
  { n: "04", t: "Branding", d: "Identity systems with a distinct voice and lasting recall." },
  { n: "05", t: "Thumbnail Design", d: "Click-worthy thumbnails crafted to drive watch-time." },
  {
    n: "06",
    t: "Motion Graphics",
    d: "Animated typography and effects that bring stories to life.",
  },
];

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

function ServiceCard({ s }: { s: (typeof services)[number] }) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(50);
  const srx = useSpring(rx, { stiffness: 180, damping: 18 });
  const sry = useSpring(ry, { stiffness: 180, damping: 18 });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || frameRef.current) return;
    const cx = e.clientX;
    const cy = e.clientY;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const r = el.getBoundingClientRect();
      const px = (cx - r.left) / r.width;
      const py = (cy - r.top) / r.height;
      ry.set((px - 0.5) * 10);
      rx.set(-(py - 0.5) * 10);
      glowX.set(px * 100);
      glowY.set(py * 100);
    });
  };
  const reset = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    rx.set(0);
    ry.set(0);
  };

  const bg = useTransform(
    [glowX, glowY],
    ([x, y]) =>
      `radial-gradient(400px circle at ${x}% ${y}%, rgba(255,255,255,0.10), transparent 55%)`,
  );

  return (
    <motion.div
      ref={ref}
      variants={cardVariants}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      className="glass card-glow sheen group relative h-full overflow-hidden rounded-3xl p-7 [transform-style:preserve-3d]"
    >
      <motion.div
        style={{ background: bg }}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative flex items-center justify-between">
        <span className="font-display text-2xl font-bold tracking-tight text-muted-foreground">
          {s.n}
        </span>
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full rounded-full bg-foreground/40"
            style={{ animation: "pulse-ring 2.4s ease-out infinite" }}
          />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
        </span>
      </div>
      <h3 className="relative mt-12 font-display text-[1.6rem] font-bold leading-[1.1] tracking-[-0.02em]">
        {s.t}
      </h3>
      <p className="relative mt-3 text-sm leading-[1.65] tracking-[-0.005em] text-muted-foreground">
        {s.d}
      </p>
    </motion.div>
  );
}

export function Services() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const yTitle = useTransform(scrollYProgress, [0, 1], [80, -80]);
  const yGrid = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <section id="services" ref={ref} className="relative px-5 py-28 sm:py-40">
      <div className="mx-auto max-w-6xl">
        <motion.div
          style={{ y: yTitle }}
          className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end"
        >
          <div>
            <Reveal>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.45em] text-muted-foreground">
                ⟶ Services
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-6 font-display text-balance text-[2.5rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl">
                Crafted across
                <br />
                <span className="italic font-semibold text-muted-foreground">every medium.</span>
              </h2>
            </Reveal>
          </div>
        </motion.div>

        <motion.div
          style={{ y: yGrid }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
          }}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {services.map((s) => (
            <ServiceCard key={s.n} s={s} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
