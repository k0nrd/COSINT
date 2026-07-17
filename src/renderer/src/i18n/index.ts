import { fr } from './fr'

/**
 * i18n minimaliste : v1 livrée uniquement en français (spécification §1).
 * Pour ajouter une langue : créer i18n/en.ts avec les mêmes clés, ajouter
 * l'entrée dans DICTIONARIES et exposer le choix dans les Paramètres.
 */
export type MessageKey = keyof typeof fr
export type Locale = 'fr'

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { fr }

let currentLocale: Locale = 'fr'

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

/** Traduit une clé, avec interpolation `{param}`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let message: string = DICTIONARIES[currentLocale][key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      message = message.replaceAll(`{${name}}`, String(value))
    }
  }
  return message
}

/** Formatte une date/heure selon la locale courante (ex. « 03/07/2026 14:05 »). */
export function formatDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(epochMs))
}

/** Formatte une date seule (ex. « 3 juillet 2026 »). */
export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(epochMs))
}

/** Formatte une heure seule (ex. « 14:05:32 ») — journal de diagnostic (§1d). */
export function formatTime(epochMs: number): string {
  return new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium' }).format(new Date(epochMs))
}

/** Formatte un nombre selon la locale (virgule décimale en français). */
export function formatNumber(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value)
}
