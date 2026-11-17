// Supported UI languages (2026-09-27). Adding a language: add its code
// here, drop a matching dictionary file in ./dictionaries, and it shows up
// in the language switcher automatically — no other code changes needed.
export const LOCALES = ["en", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Languages offered in the staff app and on the guest QR page. English only
 * for now: the others stay translated in ./dictionaries, ready to switch
 * back on by adding them here. With one entry the picker hides itself.
 */
export const ENABLED_LOCALES: readonly Locale[] = ["en"];

export function isEnabledLocale(value: string | null | undefined): value is Locale {
  return isLocale(value) && ENABLED_LOCALES.includes(value);
}

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
