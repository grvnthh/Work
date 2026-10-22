import { motion } from "framer-motion";
import { Reveal, StaggerGroup, StaggerItem } from "../Reveal";

const roles = [
  {
    role: "Head Of Visual Communications",
    org: "VettedBuddy",
    period: "Jun 2026 — Aug 2026",
  },
  {
    role: "Graphic Designer",
    org: "Ceramic Junction",
    period: "Jul 2024 — Present",
  },
  {
    role: "Freelance Graphic Designer",
    org: "Social Crew",
    period: "Jun 2026 — Jul 2026",
  },
  {
    role: "Freelance Graphic Designer",
    org: "Graphics Academy",
    period: "May 2026 — Jun 2026",
  },
  {
    role: "Graphics & Motion Designer",
    org: "Dynamic Designs",
    period: "Jul 2025 — Jan 2026",
  },
];

const tools = [
  "Adobe Photoshop",
  "Adobe Illustrator",
  "Adobe After Effects",
  "DaVinci Resolve",
  "Figma",
  "Canva",
];

const skills = [
  "Graphic Design",
  "Motion Graphics",
  "Color Theory",
  "Typography",
  "Creative Thinking",
  "Video Editing",
  "Visual Communications",
  "Color Grading",
];

const languages = [
  { lang: "English", level: "Fluent" },
  { lang: "Hindi", level: "Fluent" },
  { lang: "Japanese", level: "Basics" },
  { lang: "Assamese", level: "Basics" },
];

export function Experience() {
  return (
    <section id="experience" className="relative px-5 py-28 sm:py-40">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.45em] text-muted-foreground">
            ⟶ Experience
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-6 font-display text-balance text-[2.5rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl">
            Where I've
            <br />
            <span className="italic font-semibold text-muted-foreground">been building.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          {/* Timeline */}
          <StaggerGroup stagger={0.08} delay={0.15} className="space-y-3">
            {roles.map((r) => (
              <StaggerItem key={r.org}>
                <motion.div
                  whileHover={{ x: 6, transition: { type: "spring", stiffness: 260, damping: 18 } }}
                  className="glass card-glow sheen group relative overflow-hidden rounded-2xl p-6"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg font-bold tracking-tight">{r.role}</h3>
                      <p className="mt-0.5 text-sm font-medium text-muted-foreground">{r.org}</p>
                    </div>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground/70">
                      {r.period}
                    </span>
                  </div>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerGroup>

          {/* Skills, tools, languages */}
          <StaggerGroup stagger={0.12} delay={0.2} className="space-y-4">
            <StaggerItem>
              <div className="glass sheen rounded-2xl p-6">
                <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.35em] text-muted-foreground">
                  Skills
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium tracking-tight text-foreground/85 transition-colors duration-300 hover:border-white/25 hover:text-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="glass sheen rounded-2xl p-6">
                <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.35em] text-muted-foreground">
                  Tools I Use
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium tracking-tight text-foreground/85 transition-colors duration-300 hover:border-white/25 hover:text-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="glass sheen rounded-2xl p-6">
                <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.35em] text-muted-foreground">
                  Languages
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {languages.map((l) => (
                    <li key={l.lang} className="flex items-center justify-between text-sm">
                      <span className="font-medium tracking-tight">{l.lang}</span>
                      <span className="text-xs text-muted-foreground">{l.level}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          </StaggerGroup>
        </div>
      </div>
    </section>
  );
}
