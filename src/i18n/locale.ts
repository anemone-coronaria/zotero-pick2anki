import type { LanguagePreference, SupportedLocale } from "./messages";

export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "ja", "zh-Hans"];

export const LOCALE_NATIVE_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  ja: "日本語",
  "zh-Hans": "简体中文",
};

export function normalizeLocale(value: string): string {
  return String(value || "").trim().replace(/_/g, "-");
}

export function detectSystemLocale(): string {
  try {
    const root = globalThis as unknown as {
      Zotero?: { locale?: string };
      Services?: { locale?: { appLocaleAsBCP47?: string; requestedLocales?: string[] } };
      navigator?: { language?: string };
    };
    return normalizeLocale(
      root.Zotero?.locale
      || root.Services?.locale?.appLocaleAsBCP47
      || root.Services?.locale?.requestedLocales?.[0]
      || root.navigator?.language
      || "en",
    );
  } catch {
    return "en";
  }
}

export function resolveLocale(preference: LanguagePreference, systemLocale = detectSystemLocale()): SupportedLocale {
  if (preference !== "system") return SUPPORTED_LOCALES.includes(preference) ? preference : "en";
  const normalized = normalizeLocale(systemLocale);
  const lower = normalized.toLowerCase();
  if (lower === "ja" || lower.startsWith("ja-")) return "ja";
  if (lower === "zh"
    || lower === "zh-cn" || lower.startsWith("zh-cn-")
    || lower === "zh-sg" || lower.startsWith("zh-sg-")
    || lower === "zh-hans" || lower.startsWith("zh-hans-")) {
    return "zh-Hans";
  }
  if (lower === "en" || lower.startsWith("en-")) return "en";
  return "en";
}

export function formatList(items: string[], preference: LanguagePreference = "en"): string {
  if (items.length <= 1) return items[0] || "";
  try {
    return new Intl.ListFormat(resolveLocale(preference), {
      style: "long",
      type: "conjunction",
    }).format(items);
  } catch {
    return items.join(", ");
  }
}
