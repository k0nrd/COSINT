/**
 * Système de couleurs v1.1 (§5) : couleurs libres au format #rrggbb.
 *
 * `color` (nœuds, liens, zones) n'est plus un énuméré mais un hex quelconque.
 * On conserve une compatibilité de lecture avec les 8 couleurs nommées de la v1
 * (migration transparente des anciens tableaux .trace).
 */

/**
 * 12 couleurs prédéfinies, lisibles sur fond sombre (§5) : teintes désaturées de
 * clarté voisine. Les couleurs déjà posées sur d'anciens tableaux sont des hex
 * stockés dans le document — elles restent affichées telles quelles.
 */
export const PRESET_COLORS: string[] = [
  '#8a94a6', // ardoise
  '#d9776e', // rouge brique
  '#d9905a', // orange
  '#d6a54a', // ambre
  '#8fb86a', // vert tendre
  '#4cb782', // vert
  '#56b5a6', // sarcelle
  '#5eb0d0', // cyan
  '#7f9bf5', // bleu acier
  '#8f97e0', // indigo
  '#b08dd6', // violet
  '#d58ba8' // rose
]

/** Couleur par défaut d'un nœud / lien / zone. */
export const DEFAULT_NODE_COLOR = '#8a94a6'
export const DEFAULT_EDGE_COLOR = '#8a94a6'
export const DEFAULT_GROUP_COLOR = '#7f9bf5'

/** Couleurs proposées par défaut pour identifier un utilisateur (curseur, avatar). */
export const USER_COLORS = ['#7f9bf5', '#4cb782', '#d9905a', '#b08dd6', '#d58ba8', '#5eb0d0', '#d9776e', '#d6a54a']

/** Correspondance des 8 couleurs nommées de la v1 → hex (migration .trace). */
const LEGACY_COLOR_MAP: Record<string, string> = {
  gray: '#8a94a6',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#f5b301',
  green: '#22c55e',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  purple: '#a855f7'
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/
const HEX_SHORT_RE = /^#([0-9a-fA-F]{3})$/

/** Valide/normalise un hex (#rgb ou #rrggbb) en #rrggbb minuscule ; null sinon. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (HEX_RE.test(v)) return v.toLowerCase()
  const short = HEX_SHORT_RE.exec(v)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return null
}

export function isValidHex(value: unknown): boolean {
  return normalizeHex(value) !== null
}

/**
 * Résout une valeur de couleur stockée en hex affichable :
 *  - un hex valide est renvoyé normalisé ;
 *  - un ancien nom de couleur v1 (« gray »…) est traduit ;
 *  - toute autre valeur retombe sur le gris par défaut.
 */
export function colorHex(value: string | undefined | null): string {
  if (value == null) return DEFAULT_NODE_COLOR
  const hex = normalizeHex(value)
  if (hex) return hex
  return LEGACY_COLOR_MAP[value] ?? DEFAULT_NODE_COLOR
}

/** `#rrggbb` + opacité 0..1 → `rgba(...)` pour les fonds translucides. */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = colorHex(hex)
  const r = parseInt(normalized.slice(1, 3), 16)
  const g = parseInt(normalized.slice(3, 5), 16)
  const b = parseInt(normalized.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Couleur de texte lisible (#000 ou #fff) sur un fond de couleur donné. */
export function contrastText(hex: string): string {
  const normalized = colorHex(hex)
  const r = parseInt(normalized.slice(1, 3), 16) / 255
  const g = parseInt(normalized.slice(3, 5), 16) / 255
  const b = parseInt(normalized.slice(5, 7), 16) / 255
  // Luminance relative (approximation sRGB).
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? '#0b0d11' : '#ffffff'
}

/** Initiales (2 caractères max) pour les avatars de présence. */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
