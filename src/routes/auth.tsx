import { createFileRoute } from "@tanstack/react-router";
import { PortfolioAdmin } from "@/components/PortfolioAdmin";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "CMS Login — Granth Agrawal" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PortfolioAdmin,
});
