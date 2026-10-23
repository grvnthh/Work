import { createFileRoute } from "@tanstack/react-router";
import { PortfolioAdmin } from "@/components/PortfolioAdmin";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Granth Agrawal" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PortfolioAdmin,
});
