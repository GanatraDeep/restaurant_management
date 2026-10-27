// Single source of truth for the product's own branding. A restaurant's
// branding (its name + uploaded logo, see RestaurantBrand in app-shell.tsx)
// always takes priority inside the app; this is the fallback and the mark
// used on public pages (landing, login, signup, docs).
export const BRAND = {
  name: "F Cartel",
  tagline: "Run your restaurant under your own brand.",
  description:
    "F Cartel is restaurant management software — POS, kitchen display, tables, reservations, inventory, and CRM — that puts your restaurant's name and logo front and center.",
  logoSrc: "/logo.png",
  // Optional: shown as "Contact support" in the app sidebar when set.
  supportUrl: process.env.NEXT_PUBLIC_SUPPORT_URL || null,
} as const;
