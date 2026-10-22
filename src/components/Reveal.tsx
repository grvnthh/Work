import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import type { ReactNode, MouseEvent } from "react";
import { useRef, useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Only hint the compositor while a transform is actually running.
 * Leaving `will-change` on permanently is what makes long pages feel heavy.
 */
function useWillChange() {
  const [active, setActive] = useState(true);
  return {
    style: { willChange: active ? "transform, opacity" : "auto" } as const,
    onAnimationComplete: () => setActive(false),
  };
}

const variants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

export function Reveal({
  children,
  delay = 0,
  className,
  y = 30,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const reduced = useReducedMotion();
  const wc = useWillChange();
  const dy = reduced ? 0 : y;

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      style={wc.style}
      onAnimationComplete={wc.onAnimationComplete}
      variants={{
        hidden: { opacity: 0, y: dy },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: reduced ? 0.2 : 0.7, ease: EASE, delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

export function StaggerGroup({
  children,
  className,
  stagger = 0.08,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduced ? 0 : stagger,
            delayChildren: reduced ? 0 : delay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const wc = useWillChange();
  return (
    <motion.div
      className={className}
      variants={itemVariants}
      style={wc.style}
      onAnimationComplete={wc.onAnimationComplete}
    >
      {children}
    </motion.div>
  );
}

/** Magnetic wrapper: element gently follows cursor within its bounds. */
export function Magnetic({
  children,
  strength = 0.3,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 26, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 220, damping: 26, mass: 0.5 });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const cx = e.clientX;
    const cy = e.clientY;
    // Throttle to one measurement per frame — avoids layout thrash on fast cursors.
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const r = el.getBoundingClientRect();
      x.set((cx - (r.left + r.width / 2)) * strength);
      y.set((cy - (r.top + r.height / 2)) * strength);
    });
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { itemVariants };

/** Word-by-word mask reveal — words slide up from behind a clipped line. */
export function TextReveal({
  text,
  className,
  delay = 0,
  stagger = 0.055,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: "span" | "h1" | "h2" | "h3" | "p";
}) {
  const reduced = useReducedMotion();
  const MotionTag = motion[Tag] as typeof motion.span;
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduced ? 0 : stagger,
            delayChildren: reduced ? 0 : delay,
          },
        },
      }}
    >
      {text.split(" ").map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block overflow-hidden align-bottom"
          style={{ paddingBottom: "0.08em" }}
        >
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: reduced ? "0%" : "110%", opacity: 0 },
              visible: {
                y: "0%",
                opacity: 1,
                transition: { duration: reduced ? 0.2 : 0.85, ease: EASE },
              },
            }}
          >
            {word}
            {"\u00A0"}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}

/** Scroll-linked parallax (already smoothed by Lenis). */
export function Parallax({
  children,
  className,
  distance = 60,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [distance, -distance]);
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/** Soft scale + blur-free fade — cheap alternative to filter animations. */
export function ScaleIn({
  children,
  className,
  delay = 0,
  from = 0.96,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  from?: number;
}) {
  const reduced = useReducedMotion();
  const wc = useWillChange();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      style={wc.style}
      onAnimationComplete={wc.onAnimationComplete}
      variants={{
        hidden: { opacity: 0, scale: reduced ? 1 : from },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { duration: reduced ? 0.2 : 0.8, ease: EASE, delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Character-level counter-free shimmer entrance for small labels. */
export function FadeUpChars({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduced ? 0 : 0.02,
            delayChildren: delay,
          },
        },
      }}
    >
      {text.split("").map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          className="inline-block"
          variants={{
            hidden: { opacity: 0, y: reduced ? 0 : 8 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
          }}
        >
          {ch === " " ? "\u00A0" : ch}
        </motion.span>
      ))}
    </motion.span>
  );
}
