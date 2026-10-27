import { ImageUp, LayoutDashboard, Receipt, Store } from "lucide-react";
import { Reveal, RevealGroup, RevealItem } from "@/components/marketing/reveal";

const steps = [
  {
    icon: Store,
    title: "Name your restaurant",
    description: "Tell us what your guests call you when you sign up — it becomes the name across your workspace.",
  },
  {
    icon: ImageUp,
    title: "Upload your logo",
    description: "Add it during sign-up or any time later from Settings. PNG, JPG, WebP, or GIF up to 5 MB.",
  },
  {
    icon: LayoutDashboard,
    title: "Your brand leads every screen",
    description: "Your logo and name sit at the top of the dashboard, POS, and login — fcartel stays a small credit line.",
  },
  {
    icon: Receipt,
    title: "Consistent everywhere guests look",
    description: "The self-order kiosk welcomes guests with your logo too, so they always know whose kitchen they're ordering from.",
  },
];

// Illustrative sidebar header — what a restaurant sees after signing up.
function BrandedSidebarMock() {
  return (
    <div
      aria-hidden
      className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/60 bg-sidebar shadow-xl shadow-primary/5"
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-white">
          SR
        </div>
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Spice Route</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        {["Dashboard", "POS", "Orders", "Kitchen", "Tables", "Menu"].map((label, i) => (
          <div
            key={label}
            className={
              i === 1
                ? "rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-accent-foreground"
                : "rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70"
            }
          >
            {label}
          </div>
        ))}
      </div>
      <div className="border-t border-sidebar-border px-5 py-3 text-xs text-sidebar-foreground/60">
        Powered by <span className="font-semibold">fcartel</span>
      </div>
    </div>
  );
}

export function BrandingSection() {
  return (
    <section id="branding" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your name. Your logo. Not ours.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Your staff should see your restaurant when they clock in, not a
              software vendor. fcartel is white-label from the first screen.
            </p>
          </Reveal>
          <RevealGroup className="mt-10 grid gap-6 sm:grid-cols-2">
            {steps.map((s) => (
              <RevealItem key={s.title}>
                <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="size-5" />
                </div>
                <h3 className="mt-3 text-[15px] font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
        <Reveal delay={0.1} className="flex justify-center lg:justify-end">
          <BrandedSidebarMock />
        </Reveal>
      </div>
    </section>
  );
}
