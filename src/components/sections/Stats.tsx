import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "../Reveal";

const stats: { v: number; suffix?: string; l: string }[] = [
  { v: 100, suffix: "+", l: "Projects Completed" },
  { v: 50, suffix: "+", l: "Happy Clients" },
  { v: 2, suffix: "+", l: "Years of Experience" },
  { v: 24, suffix: "/7", l: "Communication & Support" },
];

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 20, mass: 1 });
  const rounded = useTransform(spring, (v) => Math.round(v).toLocaleString());
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, mv, to]);

  useEffect(() => rounded.on("change", (v) => setDisplay(v)), [rounded]);

  return <span ref={ref}>{display}</span>;
}

export function Stats() {
  return (
    <section className="relative px-5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.l} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -6, transition: { type: "spring", stiffness: 260, damping: 18 } }}
                className="glass card-glow sheen hover-lift group relative overflow-hidden rounded-3xl p-8 text-center"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="font-display text-5xl font-bold tracking-tight sm:text-6xl">
                  <CountUp to={s.v} />
                  {s.suffix && (
                    <span className="ml-0.5 inline-block font-sans font-light text-foreground/70">
                      {s.suffix}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
                  {s.l}
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
