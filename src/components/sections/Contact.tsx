import { Reveal, ScaleIn, TextReveal } from "../Reveal";

import { ContactForm } from "./ContactForm";
import paypalQr from "@/assets/paypal-qr.jpg";
import { MediaImage } from "@/components/MediaImage";

const channels = [
  {
    name: "WhatsApp",
    href: "https://wa.me/919549946123",
    handle: "+91 95499 46123",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "https://instagram.com/grvnthh",
    handle: "@grvnthh",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    href: "https://linkedin.com/in/granth-agrawal-8926a039a",
    handle: "Granth Agrawal",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14M8.34 17.34V10.5H6.17v6.84h2.17M7.25 9.5a1.26 1.26 0 100-2.52 1.26 1.26 0 000 2.52m10.92 7.84v-3.75c0-1.96-1.05-2.87-2.45-2.87-1.13 0-1.64.62-1.92 1.06v-.91h-2.17v6.84h2.17v-3.82c0-.94.18-1.85 1.34-1.85 1.15 0 1.16 1.07 1.16 1.91v3.76h2.17" />
      </svg>
    ),
  },
  {
    name: "Email",
    href: "mailto:work@grvnth.xyz",
    handle: "work@grvnth.xyz",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    ),
  },
];

export function Contact() {
  return (
    <section id="contact" className="relative px-5 py-28 sm:py-40">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="text-center text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
            ⟶ Contact
          </p>
        </Reveal>
        <h2 className="mt-6 text-center font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl md:text-8xl">
          <TextReveal text="Let's make" delay={0.05} className="block" />
          <TextReveal
            text="something great."
            delay={0.2}
            className="block italic text-muted-foreground"
          />
        </h2>

        <Reveal delay={0.2}>
          <div className="mt-14">
            <ContactForm />
          </div>
        </Reveal>

        <Reveal delay={0.3}>
          <p className="mt-14 text-center text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            Or reach out directly
          </p>
        </Reveal>

        <Reveal delay={0.35}>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {channels.map((c) => (
              <a
                key={c.name}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="glass sheen hover-lift group flex items-center justify-between rounded-2xl p-5 hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-4">
                  <div className="glass-strong flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-105">
                    {c.icon}
                  </div>
                  <div>
                    <div className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                      {c.name}
                    </div>
                    <div className="mt-1 text-sm font-medium tracking-tight">{c.handle}</div>
                  </div>
                </div>
                <svg
                  className="h-4 w-4 text-muted-foreground transition-all duration-500 group-hover:translate-x-1 group-hover:-translate-y-0.5 group-hover:text-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </a>
            ))}
          </div>
        </Reveal>

        <ScaleIn delay={0.1}>
          <div className="mt-10 flex justify-center">
            <div className="glass sheen hover-lift w-full max-w-sm rounded-3xl p-6 text-center sm:max-w-md sm:p-8">
              <div className="text-[0.6rem] font-medium uppercase tracking-[0.35em] text-muted-foreground">
                Quick Payment
              </div>
              <div className="mt-3 font-sans text-[1.75rem] font-semibold leading-none tracking-[-0.045em]">
                Pay<span className="text-muted-foreground">Pal</span>
              </div>
              <p className="mx-auto mt-3 max-w-xs text-[0.8rem] font-light leading-relaxed tracking-[-0.01em] text-muted-foreground/80">
                Scan this code with your phone camera to pay instantly. No account details shared.
              </p>
              <div className="mt-6 inline-block rounded-2xl bg-white p-3 shadow-2xl shadow-black/20 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02]">
                <MediaImage
                  src={paypalQr}
                  alt="PayPal QR code — scan to pay Granth Agrawal"
                  width={240}
                  height={240}
                  loading="lazy"
                  decoding="async"
                  className="h-48 w-48 sm:h-60 sm:w-60"
                />
              </div>
              <p className="mt-5 text-[0.58rem] font-medium uppercase tracking-[0.3em] text-muted-foreground/60">
                Scan on phone or desktop screen
              </p>
            </div>
          </div>
        </ScaleIn>
      </div>
    </section>
  );
}
