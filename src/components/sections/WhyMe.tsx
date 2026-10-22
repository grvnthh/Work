import { motion } from "framer-motion";
import { Reveal, StaggerGroup, StaggerItem, TextReveal } from "../Reveal";

const items = [
  "Modern Visuals",
  "Creative Solutions",
  "Attention To Detail",
  "Fast Delivery",
  "Client Focused",
  "Consistent Quality",
];

export function WhyMe() {
  return (
    <section id="why" className="relative px-5 py-28 sm:py-40">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
            ⟶ Why Work With Me
          </p>
        </Reveal>
        <h2 className="mt-6 max-w-3xl font-display text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl">
          <TextReveal text="A standard you can" delay={0.05} />
          <TextReveal
            text="feel."
            delay={0.25}
            className="italic font-semibold text-muted-foreground"
          />
        </h2>

        <StaggerGroup
          stagger={0.08}
          delay={0.15}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((it, i) => (
            <StaggerItem key={it}>
              <motion.div
                whileHover={{ y: -6, transition: { type: "spring", stiffness: 260, damping: 18 } }}
                className="glass card-glow sheen hover-lift group flex items-center gap-4 rounded-2xl p-6"
              >
                <div className="glass-strong relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
                  <span className="font-display text-sm font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <span className="text-base font-medium tracking-tight transition-colors duration-500 group-hover:text-foreground">
                  {it}
                </span>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
