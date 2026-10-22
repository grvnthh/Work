import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import portrait from "@/assets/granth-portrait.jpg";
import { MediaImage } from "@/components/MediaImage";
import { Parallax, Reveal, StaggerGroup, StaggerItem } from "../Reveal";

export function About() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const yHeading = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const yBody = useTransform(scrollYProgress, [0, 1], [40, -20]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0.4, 1, 1, 0.6]);

  return (
    <section id="about" ref={ref} className="relative px-5 py-28 sm:py-40">
      <motion.div style={{ opacity }} className="mx-auto max-w-5xl">
        <Reveal>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.45em] text-muted-foreground">
            ⟶ About
          </p>
        </Reveal>

        <motion.h2
          style={{ y: yHeading }}
          className="mt-6 font-display text-balance text-[2.5rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl lg:text-[5.5rem]"
        >
          <StaggerGroup stagger={0.12}>
            <StaggerItem className="block overflow-hidden">
              <span className="block">Visuals with intent.</span>
            </StaggerItem>
            <StaggerItem className="block overflow-hidden">
              <span className="block italic font-semibold text-muted-foreground">
                Stories that linger.
              </span>
            </StaggerItem>
          </StaggerGroup>
        </motion.h2>

        <motion.div style={{ y: yBody }} className="mt-14 grid gap-8 md:grid-cols-2">
          <StaggerGroup stagger={0.12} delay={0.1}>
            <StaggerItem>
              <Parallax
                distance={28}
                className="glass group relative mb-8 overflow-hidden rounded-3xl"
              >
                <MediaImage
                  src={portrait}
                  alt="Granth Agrawal, freelance graphic designer and video editor"
                  loading="lazy"
                  width={1000}
                  height={1000}
                  className="aspect-square w-full object-cover transition-all duration-700 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-5">
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.35em] text-muted-foreground">
                    Granth Agrawal
                  </p>
                </div>
              </Parallax>
              <p className="text-pretty text-lg leading-[1.7] tracking-[-0.005em] text-muted-foreground">
                Graphic Designer &amp; Video Editor with 2+ years of experience creating impactful
                visual content for brands, businesses, startups, and creators — based in North
                Lakhimpur, Assam, India.
              </p>
            </StaggerItem>
          </StaggerGroup>

          <StaggerGroup stagger={0.12} delay={0.2}>
            <div className="space-y-6">
              <StaggerItem>
                <p className="text-pretty leading-[1.75] tracking-[-0.005em] text-muted-foreground">
                  With 100+ completed projects across branding, social media design, motion
                  graphics, marketing creatives, and video editing, I blend creativity, strategy,
                  and storytelling to help brands stand out.
                </p>
              </StaggerItem>
              <StaggerItem>
                <p className="text-pretty leading-[1.75] tracking-[-0.005em] text-muted-foreground">
                  From social media creatives and branding to promotional videos and digital
                  content, I focus on delivering impactful, modern, and memorable visual
                  experiences.
                </p>
              </StaggerItem>
            </div>
          </StaggerGroup>
        </motion.div>
      </motion.div>
    </section>
  );
}
