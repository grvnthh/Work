import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function CursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const sx = useSpring(x, { damping: 32, stiffness: 240, mass: 0.4 });
  const sy = useSpring(y, { damping: 32, stiffness: 240, mass: 0.4 });

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    setEnabled(true);

    let frame = 0;
    const move = (e: MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        x.set(e.clientX - 250);
        y.set(e.clientY - 250);
      });
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => {
      window.removeEventListener("mousemove", move);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-[60] h-[500px] w-[500px] rounded-full"
      style={{
        background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 60%)",
        x: sx,
        y: sy,
        willChange: "transform",
        contain: "strict",
      }}
    />
  );
}
