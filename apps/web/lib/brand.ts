// Single source of truth for the product's own branding. A restaurant's
// branding (its name + uploaded logo, see RestaurantBrand in app-shell.tsx)
// always takes priority inside the app; this is the fallback and the mark
// used on public pages (landing, login, signup, docs, policies).
export const BRAND = {
  name: "F Cartel",
  tagline: "Run your restaurant under your own brand.",
  description:
    "F Cartel is restaurant management software — POS, kitchen display, tables, reservations, inventory, and CRM — that puts your restaurant's name and logo front and center.",
  logoSrc: "/logo.png",
  // Shown as "Contact support" in the app sidebar and docs; the contact page by default.
  supportUrl: process.env.NEXT_PUBLIC_SUPPORT_URL || "/contact",
} as const;

// The business behind F Cartel, as shown on the contact and policy pages
// (payment providers check these).
export const BUSINESS = {
  legalName: "Divtech",
  displayName: "F Cartel - By Divtech",
  email: "hello@divtech.in",
  phone: "+91 94299 11067",
  // Registered / operating address — shown on /contact and the privacy page.
  address: "A-35, River Palace, Near Bahumali, Nanpura, Surat - 395001" as string | null,
  website: "https://fcartel.divtech.cloud",
  policiesUpdated: "29 October 2026",
} as const;
