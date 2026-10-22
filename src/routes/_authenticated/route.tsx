import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { CMS_ADMIN_EMAIL, isCmsAuthenticated } from "@/routes/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!isCmsAuthenticated()) {
      throw redirect({ to: "/auth" });
    }
    return { user: { email: CMS_ADMIN_EMAIL } };
  },
  component: () => <Outlet />,
});
