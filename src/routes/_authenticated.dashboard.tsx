import { createFileRoute } from "@tanstack/react-router";
import { PortfolioAdmin } from "@/components/PortfolioAdmin";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Portfolio dashboard — Granth Agrawal" },
      { name: "description", content: "Private portfolio content management for Granth Agrawal." },
      { property: "og:title", content: "Portfolio dashboard — Granth Agrawal" },
      { property: "og:description", content: "Private portfolio content management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PortfolioAdmin,
});
