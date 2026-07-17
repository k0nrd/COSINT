/**
 * Système de couleurs v1.1 (§5) : couleurs libres au format #rrggbb.
 *
 * `color` (nœuds, liens, zones) n'est plus un énuméré mais un hex quelconque.
 * On conserve une compatibilité de lecture avec les 8 couleurs nommées de la v1
 * (migration transparente des anciens tableaux .trace).
 */

/** 12 couleurs prédéfinies, choisies pour rester lisibles sur fond sombre (§5). */
export const PRESET_COLORS: string[] = [
  '#8a94a6', // ardoise
  '#ef4444', // rouge
  '#f97316', // orange
  '#f5b301', // ambre
  '#22c55e', // vert
  '#10b981', // émeraude
  '#06b6d4', // cyan
  '#3b82f6', // bleu
  '#6366f1', // indigo
  '#a855f7', // violet
  '#ec4899', // rose
  '#94a3b8' // gris clair
]

/** Couleur par défaut d'un nœud / lien / zone. */
export const DEFAULT_NODE_COLOR = '#8a94a6'
export const DEFAULT_EDGE_COLOR = '#8a94a6'
export const DEFAULT_GROUP_COLOR = '#3b82f6'

/** Couleurs proposées par défaut pour identifier un utilisateur (curseur, avatar). */
export const USER_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#06b6d4', '#ef4444', '#f5b301']

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
