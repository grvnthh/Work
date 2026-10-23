import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowDown, ArrowUpRight, Mail, ShoppingBag, Sparkles } from "lucide-react";
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
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-5 pt-28 pb-20 sm:pt-36 sm:pb-28"
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
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:gap-3.5">
            {/* Upper Two: Matching Glass Style */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5">
              <Magnetic strength={0.3}>
                <motion.a
                  href="#work"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="glass-strong group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border border-white/20 bg-white/[0.06] px-5 py-3 text-xs font-semibold tracking-wide text-foreground shadow-[0_0_25px_-5px_rgba(255,255,255,0.12)] transition-all duration-300 hover:border-white/40 hover:bg-white/[0.12] hover:shadow-[0_0_35px_-5px_rgba(255,255,255,0.22)] sm:px-7 sm:py-3.5 sm:text-sm"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <Sparkles className="relative h-3.5 w-3.5 text-foreground/80 transition-transform duration-300 group-hover:scale-110 sm:h-4 sm:w-4" />
                  <span className="relative">Explore Work</span>
                  <ArrowDown className="relative h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 group-hover:translate-y-0.5 group-hover:text-foreground sm:h-4 sm:w-4" />
                </motion.a>
              </Magnetic>

              <Magnetic strength={0.3}>
                <motion.a
                  href="https://shop.grvnth.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="glass-strong group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border border-white/20 bg-white/[0.06] px-5 py-3 text-xs font-semibold tracking-wide text-foreground shadow-[0_0_25px_-5px_rgba(255,255,255,0.12)] transition-all duration-300 hover:border-white/40 hover:bg-white/[0.12] hover:shadow-[0_0_35px_-5px_rgba(255,255,255,0.22)] sm:px-7 sm:py-3.5 sm:text-sm"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <ShoppingBag className="relative h-3.5 w-3.5 text-foreground/80 transition-transform duration-300 group-hover:scale-110 sm:h-4 sm:w-4" />
                  <span className="relative">Visit Shop</span>
                  <ArrowUpRight className="relative h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground sm:h-4 sm:w-4" />
                </motion.a>
              </Magnetic>
            </div>

            {/* Below One: Solid White Style */}
            <div className="flex items-center justify-center">
              <Magnetic strength={0.3}>
                <motion.a
                  href="#contact"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-foreground px-7 py-3 text-xs font-semibold tracking-wide text-background shadow-[0_0_30px_-5px_rgba(255,255,255,0.35)] transition-all duration-300 hover:bg-foreground/90 hover:shadow-[0_0_40px_-3px_rgba(255,255,255,0.5)] sm:px-8 sm:py-3.5 sm:text-sm"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <Mail className="relative h-3.5 w-3.5 text-background transition-transform duration-300 group-hover:scale-110 sm:h-4 sm:w-4" />
                  <span className="relative">Contact Me</span>
                  <ArrowUpRight className="relative h-3.5 w-3.5 text-background/70 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-background sm:h-4 sm:w-4" />
                </motion.a>
              </Magnetic>
            </div>
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
        className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[0.6rem] uppercase tracking-[0.4em] text-muted-foreground md:flex [@media(max-height:720px)]:hidden"
      >
        <span>Scroll</span>
        <span className="h-8 w-px bg-gradient-to-b from-foreground/60 to-transparent" />
      </motion.div>
    </section>
  );
}
