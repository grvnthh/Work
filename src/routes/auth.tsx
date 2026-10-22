import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const CMS_ADMIN_EMAIL = "granth@grvnth.xyz";
const CMS_ADMIN_PASSWORD = "Granth@246";
export const CMS_AUTH_STORAGE_KEY = "grvnth_cms_auth";
export const CMS_AUTH_TOKEN_VALUE = "granth@grvnth.xyz:authenticated";

let memoryAuthenticated = false;

export function isCmsAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  if (memoryAuthenticated) return true;
  try {
    if (localStorage.getItem(CMS_AUTH_STORAGE_KEY) === CMS_AUTH_TOKEN_VALUE) {
      memoryAuthenticated = true;
      return true;
    }
  } catch {
    // Ignore localStorage restrictions
  }
  try {
    if (sessionStorage.getItem(CMS_AUTH_STORAGE_KEY) === CMS_AUTH_TOKEN_VALUE) {
      memoryAuthenticated = true;
      return true;
    }
  } catch {
    // Ignore sessionStorage restrictions
  }
  return false;
}

export function clearCmsAuthentication(): void {
  memoryAuthenticated = false;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CMS_AUTH_STORAGE_KEY);
    localStorage.removeItem("grvnth_owner_session");
  } catch {
    // Ignore storage errors
  }
  try {
    sessionStorage.removeItem(CMS_AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Studio CMS Sign In — Granth Agrawal" },
      {
        name: "description",
        content: "Private sign-in for the Granth Agrawal Studio CMS.",
      },
      { property: "og:title", content: "Studio CMS Sign In — Granth Agrawal" },
      { property: "og:description", content: "Private sign-in for Studio CMS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail !== CMS_ADMIN_EMAIL || password !== CMS_ADMIN_PASSWORD) {
      toast.error("Invalid email or password.");
      return;
    }

    setBusy(true);
    try {
      memoryAuthenticated = true;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(CMS_AUTH_STORAGE_KEY, CMS_AUTH_TOKEN_VALUE);
        } catch {
          // Ignore iframe storage restrictions
        }
        try {
          sessionStorage.setItem(CMS_AUTH_STORAGE_KEY, CMS_AUTH_TOKEN_VALUE);
        } catch {
          // Ignore iframe storage restrictions
        }
      }
      toast.success("Welcome back, Granth!");
      await navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grain flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-md rounded-[2rem] border border-white/12 bg-neutral-950/90 p-8 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="font-display text-2xl font-bold tracking-tight">
            Granth<span className="text-muted-foreground">.</span>
          </Link>
          <Link
            to="/"
            className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Portfolio</span>
          </Link>
        </div>

        <div className="mt-8 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span>Private Studio Access</span>
        </div>

        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Studio CMS
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Sign in with your studio credentials to manage showcase items, photos, and videos.
        </p>

        <form className="mt-8 space-y-5" onSubmit={(e) => void submit(e)}>
          <label className="block space-y-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Email</span>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              maxLength={255}
              className="h-11 rounded-xl border-white/15 bg-black/60 text-sm text-foreground placeholder:text-muted-foreground/50"
            />
          </label>

          <label className="block space-y-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Password</span>
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              maxLength={128}
              className="h-11 rounded-xl border-white/15 bg-black/60 text-sm text-foreground placeholder:text-muted-foreground/50"
            />
          </label>

          <Button
            type="submit"
            className="h-11 w-full rounded-full bg-foreground text-xs font-semibold uppercase tracking-wider text-background hover:bg-foreground/90"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in to CMS"}
          </Button>
        </form>
      </div>
    </main>
  );
}
