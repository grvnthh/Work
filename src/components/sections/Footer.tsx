export function Footer() {
  return (
    <footer className="relative border-t border-white/10 px-5 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
        <div className="font-display text-2xl tracking-tight">
          Granth<span className="text-muted-foreground">.</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <a
            href="https://instagram.com/_grvnth_"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Instagram
          </a>
          <a
            href="https://linkedin.com/in/granth-agrawal-8926a039a"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            LinkedIn
          </a>
          <a href="mailto:work@grvnth.xyz" className="transition-colors hover:text-foreground">
            work@grvnth.xyz
          </a>
        </div>
        <div className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
          © 2026 Granth Agrawal. All Rights Reserved.
        </div>
      </div>
    </footer>
  );
}
