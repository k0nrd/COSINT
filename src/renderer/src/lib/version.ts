/**
 * Comparaison de versions applicatives (contrôle de compatibilité des pairs, v1.4).
 *
 * Objectif : empêcher un participant exécutant une version ANTÉRIEURE de rejoindre
 * un tableau (une version antérieure ne comprend pas les nouveaux formats — chunks
 * d'images, rôles, cycle de partage — et pourrait dégrader le tableau).
 */

/** Version de l'application (injectée au build). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

/** Découpe une version `major.minor.patch` en triplet numérique (défensif). */
function parse(version: unknown): [number, number, number] {
  if (typeof version !== 'string') return [0, 0, 0]
  const parts = version
    .trim()
    .split('.')
    .map((segment) => {
      const n = parseInt(segment, 10)
      return Number.isFinite(n) && n >= 0 ? n : 0
    })
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** -1 si a < b, 0 si égales, 1 si a > b (comparaison major.minor.patch). */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 {
  const va = parse(a)
  const vb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (va[i] < vb[i]) return -1
    if (va[i] > vb[i]) return 1
  }
  return 0
}

/** true si `candidate` est STRICTEMENT antérieure à `reference`. */
export function isOlderVersion(candidate: unknown, reference: unknown): boolean {
  return compareVersions(candidate, reference) < 0
}
