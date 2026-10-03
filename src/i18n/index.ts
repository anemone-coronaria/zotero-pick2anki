import { en } from "./locales/en";
import { ja } from "./locales/ja";
import { zhHans } from "./locales/zh-Hans";
import { resolveLocale } from "./locale";
import type { LanguagePreference, Messages, SupportedLocale } from "./messages";

const CATALOGS: Record<SupportedLocale, Messages> = {
  en,
  ja,
  "zh-Hans": zhHans,
};

export function getLocale(preference: LanguagePreference = "en"): SupportedLocale {
  return resolveLocale(preference);
}

export function getMessages(preference: LanguagePreference = "en"): Messages {
  return CATALOGS[getLocale(preference)] || en;
}

export function getMessagesForLocale(locale: SupportedLocale): Messages {
  return CATALOGS[locale] || en;
}

export type { CardLabelLanguage, LanguagePreference, Messages, SupportedLocale } from "./messages";
export {
  LOCALE_NATIVE_NAMES, SUPPORTED_LOCALES, detectSystemLocale, formatList, normalizeLocale, resolveLocale,
} from "./locale";
