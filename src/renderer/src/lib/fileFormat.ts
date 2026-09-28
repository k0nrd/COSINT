/**
 * §5 v1.9 (aperçu) — libellés localisés des fichiers : taille (o/Ko/Mo selon la
 * langue) et nombre de pages (pluriels polonais : 1 strona / 2 strony / 5 stron).
 */
import { formatNumber, localeTag, t } from '@/i18n'

/** Taille lisible d'un fichier (octets → o / Ko / Mo, unités de la langue). */
export function formatFileSize(bytes: number): string {
  const value = Math.max(0, bytes)
  if (value < 1024) return t('file.sizeB', { n: formatNumber(value, 0) })
  if (value < 1024 * 1024) return t('file.sizeKB', { n: formatNumber(value / 1024, 0) })
  return t('file.sizeMB', { n: formatNumber(value / 1024 / 1024) })
}

/** « 3 pages » avec la bonne forme plurielle (Intl.PluralRules de la locale). */
export function formatPageCount(count: number): string {
  let category: Intl.LDMLPluralRule = 'other'
  try {
    category = new Intl.PluralRules(localeTag()).select(count)
  } catch {
    // Intl indisponible : forme générale.
  }
  const key = category === 'one' ? 'file.pageOne' : category === 'few' ? 'file.pageFew' : 'file.pageMany'
  return t(key, { count: formatNumber(count, 0) })
}
