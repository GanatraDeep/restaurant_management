import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { BRAND, BUSINESS } from "@/lib/brand";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#branding", label: "Your brand" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#security", label: "Security" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/api", label: "API & MCP" },
      { href: "/docs/accessibility", label: "Accessibility statement" },
      { href: "/docs/compliance-india", label: "India compliance notes" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact us" },
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/refunds", label: "Cancellation & Refunds" },
      { href: "/service-delivery", label: "Service delivery" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Logo size={28} />
              <span className="text-sm font-semibold text-foreground">{BRAND.name}</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              {BRAND.tagline} POS, kitchen display, tables, inventory, and
              CRM — with your name and logo on every screen.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {col.title}
              </h3>
              <ul className="mt-3 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {BUSINESS.displayName}. Made in India.
          </p>

        </div>
      </div>
    </footer>
  );
}
