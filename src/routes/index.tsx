import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Background } from "@/components/Background";
import { CursorGlow } from "@/components/CursorGlow";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { Loader } from "@/components/Loader";
import { Marquee } from "@/components/Marquee";
import { Nav } from "@/components/Nav";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SmoothScroll } from "@/components/SmoothScroll";
import { About } from "@/components/sections/About";
import { Contact } from "@/components/sections/Contact";
import { Experience } from "@/components/sections/Experience";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { Showcase } from "@/components/sections/Showcase";
import { Stats } from "@/components/sections/Stats";
import { Testimonials } from "@/components/sections/Testimonials";
import { WhyMe } from "@/components/sections/WhyMe";
import { getRequestOrigin } from "@/lib/origin.functions";

const title = "Granth Agrawal | Graphic Designer, Video Editor & Visual Communicator";
const description =
  "Hire Granth Agrawal — freelance graphic designer, video editor, and motion designer with 100+ projects for brands, startups, and creators worldwide.";
const keywords =
  "Granth Agrawal, GRVNTH, freelance graphic designer, freelance video editor, YouTube video editor, motion graphics designer, brand identity designer, social media design, thumbnail designer, DaVinci Resolve editor, After Effects motion designer, India";
const fallbackOrigin = "https://grvnth.lovable.app";
const ogImage =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f9366531-10df-4651-93d6-aa81fc4de01a/id-preview-65a11b99--ea7c0c67-b7a4-40a8-86d3-21e462d14eb6.lovable.app-1781748410661.png";

export const Route = createFileRoute("/")({
  loader: async () => {
    const origin = await getRequestOrigin();
    return {
      origin,
    };
  },
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? fallbackOrigin;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "keywords", content: keywords },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: `${origin}/` },
        { property: "og:type", content: "website" },
        { property: "og:image", content: ogImage },
        {
          property: "og:image:alt",
          content: "Granth Agrawal — Graphic Designer, Video Editor & Visual Communicator",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [{ rel: "canonical", href: `${origin}/` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Person",
                "@id": `${origin}/#granth-agrawal`,
                name: "Granth Agrawal",
                alternateName: ["GRVNTH", "Granth"],
                url: `${origin}/`,
                image: ogImage,
                jobTitle: "Graphic Designer, Video Editor & Visual Communicator",
                description,
                email: "mailto:work@grvnth.xyz",
                telephone: "+91-9549946123",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: "North Lakhimpur",
                  addressRegion: "Assam",
                  addressCountry: "IN",
                },
                sameAs: [
                  "https://instagram.com/grvnthh",
                  "https://instagram.com/_grvnth_",
                  "https://linkedin.com/in/granth-agrawal-8926a039a",
                ],
                knowsAbout: [
                  "Graphic Design",
                  "Video Editing",
                  "YouTube Retention Editing",
                  "Motion Graphics",
                  "Brand Identity",
                  "Social Media Design",
                  "Thumbnail Design",
                  "Color Grading",
                  "Visual Communications",
                  "Adobe After Effects",
                  "DaVinci Resolve",
                  "Adobe Photoshop",
                  "Adobe Illustrator",
                  "Figma",
                ],
                knowsLanguage: ["English", "Hindi", "Japanese", "Assamese"],
                makesOffer: [
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "Graphic Design",
                      description:
                        "Bold, modern visuals, marketing creatives, and campaign assets across digital and print surfaces.",
                    },
                  },
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "Video Editing",
                      description:
                        "High-retention long-form YouTube editing, commercial cuts, Shorts/Reels, and cinematic post-production.",
                    },
                  },
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "Social Media Design",
                      description:
                        "Scroll-stopping social media carousels, ad creatives, and feed visual systems.",
                    },
                  },
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "Branding & Visual Identity",
                      description:
                        "Complete brand identity systems, logos, typography, and brand guidelines.",
                    },
                  },
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "Thumbnail Design",
                      description:
                        "High-CTR YouTube and video thumbnails engineered to maximize click-through rate and watch time.",
                    },
                  },
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "Motion Graphics",
                      description:
                        "Animated typography, logo reveals, UI motion, and visual effects in Adobe After Effects.",
                    },
                  },
                ],
              },
              {
                "@type": "ProfessionalService",
                "@id": `${origin}/#studio`,
                name: "Granth Agrawal Studio (GRVNTH)",
                url: `${origin}/`,
                image: ogImage,
                description,
                founder: { "@id": `${origin}/#granth-agrawal` },
                email: "work@grvnth.xyz",
                telephone: "+91-9549946123",
                priceRange: "₹10,000 - ₹1,00,000+",
                areaServed: "Worldwide",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: "North Lakhimpur",
                  addressRegion: "Assam",
                  addressCountry: "IN",
                },
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: "5.0",
                  bestRating: "5",
                  worstRating: "1",
                  ratingCount: "50",
                },
              },
              {
                "@type": "WebSite",
                "@id": `${origin}/#website`,
                url: `${origin}/`,
                name: "Granth Agrawal — Graphic Designer & Video Editor",
                description,
                inLanguage: "en",
                publisher: { "@id": `${origin}/#granth-agrawal` },
              },
              {
                "@type": "ProfilePage",
                "@id": `${origin}/#profile-page`,
                url: `${origin}/`,
                name: title,
                description,
                isPartOf: { "@id": `${origin}/#website` },
                mainEntity: { "@id": `${origin}/#granth-agrawal` },
                speakable: {
                  "@type": "SpeakableSpecification",
                  cssSelector: ["#top h1", "#about", "#services", "#experience", "#contact"],
                },
              },
              {
                "@type": "FAQPage",
                "@id": `${origin}/#faq`,
                mainEntity: [
                  {
                    "@type": "Question",
                    name: "Who is Granth Agrawal and what services does he offer?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Granth Agrawal (GRVNTH) is a freelance graphic designer, video editor, and visual communicator based in India with 2+ years of experience and 100+ completed projects. He offers graphic design, retention-focused video editing (YouTube long-form and Shorts/Reels), motion graphics, brand identity design, social media creatives, and high-CTR thumbnail design for global brands, startups, and creators.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How can I contact or hire Granth Agrawal for a design or video editing project?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "You can hire Granth Agrawal by emailing work@grvnth.xyz, messaging directly on WhatsApp at +91 95499 46123, or submitting a project brief with attachments through the contact form on his portfolio website. He responds to all inquiries within 24 hours.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What tools and software does Granth Agrawal use?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Granth Agrawal works with industry-standard creative software including Adobe Photoshop, Adobe Illustrator, Adobe After Effects, DaVinci Resolve, Figma, and Canva, specializing in typography, color grading, motion design, and visual storytelling.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What are Granth Agrawal's typical project budgets and turnaround times?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Project budgets range from under ₹10k for single deliverables to ₹10k–₹50k, ₹50k–₹1L, and ₹1L+ for comprehensive brand systems or ongoing monthly retainers. He provides 24/7 communication support and fast turnaround tailored to creator and brand publishing schedules.",
                    },
                  },
                ],
              },
            ],
          }),
        },
      ],
    };
  },
  component: Index,
});

function Index() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("grvnth_loader_shown") === "1") {
        setLoading(false);
        return;
      }
    } catch {
      // Ignore storage errors
    }

    const t = setTimeout(() => {
      setLoading(false);
      try {
        window.sessionStorage.setItem("grvnth_loader_shown", "1");
      } catch {
        // Ignore storage errors
      }
    }, 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative grain min-h-screen overflow-x-hidden bg-background text-foreground">
      <AnimatePresence>{loading && <Loader key="loader" />}</AnimatePresence>

      <SmoothScroll />
      <Background />
      <CursorGlow />
      <ScrollProgress />
      <Nav />

      <main className="relative z-10">
        <Hero />
        <Marquee />
        <Showcase />
        <About />
        <Services />
        <Stats />
        <WhyMe />
        <Experience />
        <Testimonials />
        <Contact />
      </main>

      <Footer />
      <FloatingWhatsApp />
    </div>
  );
}
