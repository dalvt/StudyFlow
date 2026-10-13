import { en } from './en.ts';
import { es } from './es.ts';

export type TranslationKey = keyof typeof en;
export type TranslationDict = Record<TranslationKey, string>;
export type LanguageSetting = 'auto' | 'es' | 'en';
export type SupportedLanguage = 'es' | 'en';

export { en, es };

let currentSetting: LanguageSetting = 'auto';
let obsidianLanguageResolver: (() => string) | null = null;

/**
 * Injects Obsidian's runtime getLanguage function or custom resolver.
 */
export function setObsidianLanguageResolver(resolver: (() => string) | null): void {
  obsidianLanguageResolver = resolver;
}

/**
 * Updates the user's active language setting ('auto', 'es', 'en').
 */
export function setLanguage(lang: LanguageSetting): void {
  currentSetting = lang;
}

/**
 * Returns the currently configured setting ('auto', 'es', 'en').
 */
export function getLanguageSetting(): LanguageSetting {
  return currentSetting;
}

/**
 * Resolves the effective active language ('es' or 'en').
 * If set to 'auto', inspects Obsidian or local storage, defaulting to 'es' in tests / Spanish environments.
 */
export function getEffectiveLanguage(): SupportedLanguage {
  if (currentSetting === 'es' || currentSetting === 'en') {
    return currentSetting;
  }

  // 'auto' mode
  let detected = '';
  if (obsidianLanguageResolver) {
    try {
      detected = obsidianLanguageResolver();
    } catch {
      // ignore
    }
  }

  if (!detected && typeof window !== 'undefined') {
    try {
      detected =
        window.localStorage?.getItem('language') ||
        window.navigator?.language ||
        '';
    } catch {
      // ignore
    }
  }

  if (detected) {
    return detected.toLowerCase().startsWith('es') ? 'es' : 'en';
  }

  // Default fallback when undetectable (e.g. Node tests with auto setting)
  return 'es';
}

/**
 * Translates a given key into the effective language with optional interpolation.
 * Syntax for params: {paramName}
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const lang = getEffectiveLanguage();
  const dict = lang === 'es' ? es : en;
  const raw = dict[key] ?? en[key] ?? key;

  if (!params) {
    return raw;
  }

  return raw.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return paramKey in params ? String(params[paramKey]) : match;
  });
}
