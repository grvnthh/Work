import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, useEffect, type ReactNode } from "react";
const Analytics = () => null;
const SpeedInsights = () => null;

import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5">
      {/* ambient background — matches the site aurora orbs + grid */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.07),transparent_60%)]" />
        <div
          className="orb absolute -top-40 -left-40 h-[620px] w-[620px] animate-aurora"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%)",
          }}
        />
        <div
          className="orb absolute top-1/3 -right-40 h-[520px] w-[520px] animate-drift"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.09), rgba(255,255,255,0) 70%)",
            animationDelay: "-6s",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-xl text-center">
        <p className="mb-6 text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
          Error 404
        </p>
        <h1 className="font-display text-balance text-6xl font-bold leading-[0.95] tracking-tight text-foreground sm:text-8xl">
          Lost in
          <span className="italic text-muted-foreground"> space.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-sm text-balance text-sm leading-[1.7] text-muted-foreground">
          The page you're looking for doesn't exist or has drifted off. Let's get you back to
          something useful.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="/"
            className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-foreground px-7 py-4 text-sm font-semibold text-background sm:w-auto"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative z-10">Go to Main Site</span>
            <svg
              className="relative z-10 h-4 w-4 transition-transform duration-500 group-hover:translate-x-1"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <a
            href="/#contact"
            className="glass-strong group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-4 text-sm font-semibold text-foreground sm:w-auto"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">Contact Me</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function RootErrorScreen({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const ErrorComponent = lazy(() => Promise.resolve({ default: RootErrorScreen }));

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Granth Agrawal" },
      { name: "creator", content: "Granth Agrawal" },
      { name: "publisher", content: "Granth Agrawal" },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { name: "theme-color", content: "#050505" },
      { property: "og:site_name", content: "Granth Agrawal" },
      { property: "og:locale", content: "en_US" },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f9366531-10df-4651-93d6-aa81fc4de01a/id-preview-65a11b99--ea7c0c67-b7a4-40a8-86d3-21e462d14eb6.lovable.app-1781748410661.png",
      },
      {
        property: "og:image:alt",
        content: "Granth Agrawal — Freelance Graphic Designer, Video Editor & Visual Communicator",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f9366531-10df-4651-93d6-aa81fc4de01a/id-preview-65a11b99--ea7c0c67-b7a4-40a8-86d3-21e462d14eb6.lovable.app-1781748410661.png",
      },
      {
        name: "twitter:image:alt",
        content: "Granth Agrawal — Freelance Graphic Designer, Video Editor & Visual Communicator",
      },
      { name: "google-site-verification", content: "9-4NGQDm9bbCcKCNAOEQkkV6gMKvsTbX_D9wSoKJL2g" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap",
      },
      {
        rel: "alternate",
        type: "text/plain",
        href: "/llms.txt",
        title: "LLM Context & Answer Engine Summary",
      },
      {
        rel: "alternate",
        type: "text/plain",
        href: "/llms-full.txt",
        title: "Full LLM Context & Portfolio Reference",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
