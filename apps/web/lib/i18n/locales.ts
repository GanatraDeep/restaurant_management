// Supported UI languages (2026-09-27). Adding a language: add its code
// here, drop a matching dictionary file in ./dictionaries, and it shows up
// in the language switcher automatically — no other code changes needed.
export const LOCALES = ["en", "hi", "gu", "mr", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
  mr: "मराठी",
  es: "Español",
  fr: "Français",
};

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Languages offered in the staff app and on the guest QR page: English and
 * the Indian languages. Spanish / French stay translated in ./dictionaries
 * (the kiosk uses them), ready to offer here again. A key missing from a
 * language falls back to English.
 */
export const ENABLED_LOCALES: readonly Locale[] = ["en", "hi", "gu", "mr"];

export function isEnabledLocale(value: string | null | undefined): value is Locale {
  return isLocale(value) && ENABLED_LOCALES.includes(value);
}

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
