import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "../Reveal";

const reviews = [
  "Exceptional work quality and attention to detail. Every project exceeded expectations.",
  "Fast delivery, great communication, and professional results throughout the entire process.",
  "Creative, reliable, and highly skilled. The final designs helped elevate our brand presence.",
  "Understood our requirements perfectly and delivered visuals that stood out immediately.",
  "Professional experience from start to finish. Highly recommended for design and editing projects.",
];

export function Testimonials() {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const yTitle = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const yCard = useTransform(scrollYProgress, [0, 1], [80, -40]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.95, 1, 0.97]);

  useEffect(() => {
    const t = setInterval(() => {
      setDir(1);
      setI((p) => (p + 1) % reviews.length);
    }, 6000);
    return () => clearInterval(t);
  }, []);

  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    setI(n);
  };

  return (
    <section id="reviews" ref={ref} className="relative px-5 py-28 sm:py-40">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <p className="text-center font-mono text-[0.65rem] uppercase tracking-[0.45em] text-muted-foreground">
            ⟶ Testimonials
          </p>
        </Reveal>

        <motion.h2
          style={{ y: yTitle }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="mt-6 text-balance text-center font-display text-[2.5rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl"
        >
          Words from{" "}
          <span className="italic font-semibold text-muted-foreground">collaborators</span>.
        </motion.h2>

        <motion.div style={{ y: yCard, scale }} className="mt-14">
          <Reveal delay={0.2}>
            <div className="glass-strong relative overflow-hidden rounded-3xl p-8 sm:p-14">
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
              <div
                aria-hidden
                className="pointer-events-none absolute -top-8 left-6 select-none font-display text-[10rem] font-bold leading-none text-white/[0.06] sm:text-[14rem]"
              >
                “
              </div>

              <div className="relative min-h-[220px] sm:min-h-[190px]">
                <AnimatePresence mode="wait" custom={dir}>
                  <motion.div
                    key={i}
                    custom={dir}
                    initial={{ opacity: 0, y: 24 * dir }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -24 * dir }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center"
                  >
                    <div className="text-sm tracking-[0.4em] text-foreground/90">★★★★★</div>
                    <p className="mt-6 text-balance font-display text-[1.5rem] font-bold leading-[1.3] tracking-[-0.015em] sm:text-[2rem]">
                      "{reviews[i]}"
                    </p>
                    <p className="mt-6 text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
                      Verified Client · Anonymous
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-10 flex items-center justify-center gap-2">
                {reviews.map((_, idx) => (
                  <button
                    key={idx}
                    aria-label={`Review ${idx + 1}`}
                    onClick={() => go(idx)}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      idx === i
                        ? "w-10 bg-foreground"
                        : "w-1.5 bg-foreground/25 hover:bg-foreground/50"
                    }`}
                  />
                ))}
              </div>
            </div>
          </Reveal>
        </motion.div>
      </div>
    </section>
  );
}
