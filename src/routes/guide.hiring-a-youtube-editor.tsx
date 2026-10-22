import { createFileRoute, Link } from "@tanstack/react-router";

const CANONICAL = "https://grvnth.lovable.app/guide/hiring-a-youtube-editor";
const TITLE = "How to Hire a YouTube Video Editor";
const DESCRIPTION =
  "What a specialized YouTube editor does, how retention and hook editing drive channel growth, and how to hire the right one.";
const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f9366531-10df-4651-93d6-aa81fc4de01a/id-preview-65a11b99--ea7c0c67-b7a4-40a8-86d3-21e462d14eb6.lovable.app-1781748410661.png";

export const Route = createFileRoute("/guide/hiring-a-youtube-editor")({
  head: () => ({
    meta: [
      { title: `${TITLE} | Granth Agrawal` },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "hire YouTube video editor, YouTube retention editor, YouTube hook editing, video editor for creators, Shorts editor, Granth Agrawal",
      },
      { property: "og:title", content: `${TITLE} | Granth Agrawal` },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: OG_IMAGE },
      { property: "article:author", content: "Granth Agrawal" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${TITLE} | Granth Agrawal` },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "@id": `${CANONICAL}#article`,
              headline: TITLE,
              description: DESCRIPTION,
              image: OG_IMAGE,
              inLanguage: "en",
              datePublished: "2026-01-15T00:00:00Z",
              dateModified: "2026-10-21T00:00:00Z",
              author: {
                "@type": "Person",
                name: "Granth Agrawal",
                url: "https://grvnth.lovable.app/",
                email: "mailto:work@grvnth.xyz",
                jobTitle: "Graphic Designer, Video Editor & Visual Communicator",
              },
              publisher: {
                "@type": "Person",
                name: "Granth Agrawal",
                url: "https://grvnth.lovable.app/",
              },
              mainEntityOfPage: CANONICAL,
              speakable: {
                "@type": "SpeakableSpecification",
                cssSelector: ["article h1", "article h2", "article p"],
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item: "https://grvnth.lovable.app/",
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: TITLE,
                  item: CANONICAL,
                },
              ],
            },
            {
              "@type": "FAQPage",
              "@id": `${CANONICAL}#faq`,
              mainEntity: [
                {
                  "@type": "Question",
                  name: "How is a YouTube editor different from a regular video editor?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "A YouTube editor is trained on retention and hooks — cutting to keep viewers watching and to signal watch-time to the algorithm. A traditional brand editor is trained on cinematic pacing and story. Both are skilled, but only one is optimized for how YouTube distributes video.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What should I look for in a YouTube editor's portfolio?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Ask for retention graphs, not just showreels. A strong YouTube editor can point to specific videos, explain how the hook was built, and show where retention held or dipped. If they only talk about effects, keep looking.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How much does a YouTube video editor cost?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Rates vary by scope, turnaround, and channel size. A specialist long-form YouTube editor typically prices per finished video and includes hook iteration, retention-focused cuts, thumbnails collaboration, and platform-specific exports rather than charging by the hour.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: YouTubeHiringGuide,
});

function YouTubeHiringGuide() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-24 sm:py-32">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
          ⟶ Guide · For creators
        </p>
        <h1 className="mt-6 font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl md:text-6xl">
          How to hire a YouTube video editor{" "}
          <span className="italic font-semibold text-muted-foreground">
            (and why it's a different job)
          </span>
          .
        </h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
          YouTube is not a brand-video platform. It is a retention machine. The editors who
          consistently grow channels are not the same people who cut launch films or ads — they are
          trained on hooks, pacing, and the exact decisions that keep a viewer from swiping away. If
          you are a creator or channel owner hiring for the first time, this is what to look for.
        </p>

        <section className="mt-14 space-y-4">
          <h2 className="font-display text-3xl font-bold tracking-tight">The short version</h2>
          <p className="leading-relaxed text-foreground/90">
            A specialist <strong>YouTube editor</strong> optimizes for one thing: watch time. Every
            cut, sound effect, zoom, caption, and b-roll insert exists to keep the viewer from
            leaving. A traditional brand video editor optimizes for tone, story, and craft —
            different job, different instincts.
          </p>
          <p className="leading-relaxed text-foreground/90">
            If you hire the wrong one, the footage will look beautiful and the retention graph will
            still collapse in the first thirty seconds.
          </p>
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            What a YouTube editor actually does
          </h2>
          <ul className="list-disc space-y-2 pl-6 text-foreground/90">
            <li>
              <strong>Builds the hook.</strong> The first 15 seconds get rewritten, re-cut, and
              often re-shot until the retention curve stops dipping.
            </li>
            <li>
              <strong>Cuts for pace, not perfection.</strong> Removes pauses, filler words, and any
              moment the viewer might use to leave.
            </li>
            <li>
              <strong>Reads the retention graph.</strong> Watches previous videos' analytics, spots
              exactly where viewers dropped off, and edits the next one to fix that pattern.
            </li>
            <li>
              <strong>Layers b-roll, motion, and sound design.</strong> Not for polish — for pattern
              interrupts that reset attention every few seconds.
            </li>
            <li>
              <strong>Cuts a Shorts version.</strong> Not a repost — a genuine Shorts-native re-edit
              that funnels viewers back to long-form.
            </li>
          </ul>
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Why YouTube editing is a different craft
          </h2>
          <p className="leading-relaxed text-foreground/90">
            On YouTube, retention drives distribution. Distribution drives subscribers. Subscribers
            drive revenue. Every part of that chain starts in the edit — not in the camera, not in
            the thumbnail, not even in the script. A great hook cut can double a video's views on
            the same footage.
          </p>
          <p className="leading-relaxed text-foreground/90">
            Traditional brand editors are trained to preserve moments. YouTube editors are trained
            to remove them. That is a fundamental difference in instinct — one you cannot pick up
            from a weekend course.
          </p>
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            When you need a specialist YouTube editor
          </h2>
          <ul className="list-disc space-y-2 pl-6 text-foreground/90">
            <li>You have footage but retention drops in the first minute.</li>
            <li>You are posting weekly and need consistent, on-brand cuts.</li>
            <li>Your channel is monetized and every 1% of retention matters.</li>
            <li>You want Shorts that actually funnel to your long-form.</li>
            <li>You are a founder or expert whose time on the edit is not scalable.</li>
          </ul>
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            How to evaluate a YouTube editor before you hire
          </h2>
          <ol className="list-decimal space-y-3 pl-6 text-foreground/90">
            <li>
              <strong>Ask for retention graphs, not showreels.</strong> Any editor can cut a
              highlight reel. A YouTube editor should be able to show a video's analytics and
              explain the curve.
            </li>
            <li>
              <strong>Ask how they'd re-cut your worst-performing video.</strong> A good answer
              names the exact seconds where viewers left and what they would change. A weak answer
              talks about color and titles.
            </li>
            <li>
              <strong>Check the hooks.</strong> Watch the first 30 seconds of their last five edits.
              If the hooks all feel the same, the editor is on autopilot — that will show up in your
              channel too.
            </li>
            <li>
              <strong>Ask about Shorts strategy.</strong> A modern YouTube editor treats Shorts as a
              distinct format with its own pacing, captions, and vertical framing — not a cropped
              export of the long-form.
            </li>
            <li>
              <strong>Talk turnaround and volume.</strong> Consistency wins on YouTube. Two solid
              videos a month beats one perfect video a quarter.
            </li>
          </ol>
        </section>

        <section className="mt-14 space-y-4">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            A simple hiring rule of thumb
          </h2>
          <p className="leading-relaxed text-foreground/90">
            If growth on the platform is the goal — hire an editor who talks about retention, hooks,
            and analytics. If the goal is a beautifully crafted brand piece that happens to live on
            YouTube, hire a brand editor and accept that the algorithm is not the point.
          </p>
        </section>

        <section className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Want your channel edited for retention?
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            I edit long-form YouTube and Shorts built around hooks, pacing, and watch time — not
            just polish. If your footage is not performing or you are ready to publish consistently,
            let's talk.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/"
              hash="contact"
              className="inline-flex items-center rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Start a project
            </Link>
            <Link
              to="/"
              hash="services"
              className="inline-flex items-center rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
            >
              See services
            </Link>
          </div>
        </section>
      </article>
    </div>
  );
}
