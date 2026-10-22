import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { Magnetic, Reveal } from "../Reveal";

const line1 = ["Turning", "Ideas"];
const line2 = ["Into", "Impact."];

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  // pointer parallax on floating shapes
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 60, damping: 20 });
  const smy = useSpring(my, { stiffness: 60, damping: 20 });

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      if (frame || window.scrollY > window.innerHeight) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { innerWidth: w, innerHeight: h } = window;
        mx.set((e.clientX / w - 0.5) * 40);
        my.set((e.clientY / h - 0.5) * 40);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mx, my]);

  const negSmx = useTransform(smx, (v) => -v);
  const negSmy = useTransform(smy, (v) => -v);

  return (
    <section
      id="top"
      ref={ref}
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-5 pt-32 sm:pt-40"
    >
      {/* floating glass shapes with pointer + scroll parallax (separated from CSS keyframe transform) */}
      <motion.div
        style={{ y: y1, x: smx }}
        className="pointer-events-none absolute left-[6%] top-[22%] hidden h-32 w-32 md:block"
      >
        <div className="glass h-full w-full rotate-12 rounded-3xl animate-float-slow" />
      </motion.div>
      <motion.div
        style={{ y: y2, x: negSmx }}
        className="pointer-events-none absolute right-[8%] top-[28%] hidden h-40 w-40 md:block"
      >
        <div className="glass h-full w-full -rotate-6 rounded-full animate-float-slow-2" />
      </motion.div>
      <motion.div
        style={{ y: y1, x: smy }}
        className="pointer-events-none absolute bottom-[18%] right-[18%] hidden h-24 w-24 lg:block"
      >
        <div className="glass h-full w-full rotate-45 rounded-2xl animate-float-slow-2" />
      </motion.div>
      <motion.div
        style={{ y: y2, x: negSmy }}
        className="pointer-events-none absolute bottom-[22%] left-[12%] hidden h-20 w-36 lg:block"
      >
        <div className="glass h-full w-full rounded-full animate-float-slow" />
      </motion.div>

      <motion.div
        style={{ opacity, y: heroY }}
        className="relative z-10 mx-auto max-w-5xl text-center"
      >
        <Reveal>
          <div className="glass mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="absolute inline-flex h-full w-full rounded-full bg-foreground/70"
                style={{ animation: "pulse-ring 1.8s ease-out infinite" }}
              />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
            </span>
            Available for new projects
          </div>
        </Reveal>

        <h1 className="font-display text-balance text-5xl leading-[0.95] tracking-tight sm:text-7xl md:text-[7.5rem]">
          <span className="sr-only">
            Granth Agrawal — Freelance Graphic Designer & Video Editor.{" "}
          </span>
          <span className="block overflow-hidden pb-2">
            {line1.map((w, i) => (
              <motion.span
                key={w}
                className="mr-4 inline-block"
                initial={{ y: "110%", opacity: 0, rotate: 6 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ duration: 1.1, delay: 0.25 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {w}
              </motion.span>
            ))}
          </span>
          <span className="block overflow-hidden pb-2">
            {line2.map((w, i) => (
              <motion.span
                key={w}
                className={`mr-4 inline-block ${i === 0 ? "italic text-muted-foreground" : "animate-text-shine"}`}
                initial={{ y: "110%", opacity: 0, rotate: 6 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ duration: 1.1, delay: 0.6 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {w}
              </motion.span>
            ))}
          </span>
        </h1>

        <Reveal delay={0.95}>
          <p className="mx-auto mt-8 max-w-2xl text-balance text-base leading-[1.7] text-muted-foreground sm:text-lg">
            Helping brands, creators, businesses, startups, and personal brands stand out through
            impactful visuals and content.
          </p>
        </Reveal>

        <Reveal delay={1.1}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Magnetic strength={0.3}>
              <motion.a
                href="#work"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-foreground px-7 py-4 text-sm font-semibold text-background sm:w-auto"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative">Explore Work</span>
              </motion.a>
            </Magnetic>
            <Magnetic strength={0.3}>
              <motion.a
                href="#contact"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="glass-strong group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-4 text-sm font-semibold text-foreground sm:w-auto"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative">Contact Me</span>
              </motion.a>
            </Magnetic>
          </div>
        </Reveal>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 6, 0] }}
        transition={{
          opacity: { delay: 1.8, duration: 1 },
          y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-muted-foreground"
      >
        <span>Scroll</span>
        <span className="h-8 w-px bg-gradient-to-b from-foreground/60 to-transparent" />
      </motion.div>
    </section>
  );
}
