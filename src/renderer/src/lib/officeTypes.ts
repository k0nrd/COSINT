/**
 * §R2 v1.9 (aperçu bureautique) — types PARTAGÉS du contrat d'aperçu bureautique
 * (sans dépendance : importés par officePreview.ts ET legacyOffice.ts sans cycle).
 */

/** Un bloc de contenu extrait (jamais de HTML : texte brut uniquement). */
export type OfficeBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; name?: string; rows: string[][] }
  | { kind: 'slide'; index: number; title?: string; texts: string[] }

/** Résultat de l'extraction. */
export type OfficePreview = {
  /** Format détecté (ex. 'docx', 'ods', 'rtf', 'doc'). */
  format: string
  /** Titre du document (métadonnées), s'il existe. */
  title?: string
  /** Miniature intégrée — data: URL image/png ou image/jpeg UNIQUEMENT (jamais SVG/WMF). */
  thumbnail?: string
  blocks: OfficeBlock[]
  /** true si une limite a coupé le contenu. */
  truncated: boolean
  /** Avertissements non bloquants (clés i18n `file.office.*` ou texte neutre). */
  warnings: string[]
}

/** Raison d'échec typée d'une extraction. */
export type OfficeFailure = 'unsupported' | 'encrypted' | 'corrupt' | 'tooLarge' | 'timeout' | 'aborted'

/** Erreur typée levée par extractOfficePreview (le rendu affiche `file.office.<reason>`). */
export class OfficePreviewError extends Error {
  readonly reason: OfficeFailure
  constructor(reason: OfficeFailure, message?: string) {
    super(message ?? reason)
    this.name = 'OfficePreviewError'
    this.reason = reason
  }
}

/** Raison d'échec d'une erreur quelconque (défaut : corrompu). */
export function officeFailureOf(error: unknown): OfficeFailure {
  if (error instanceof OfficePreviewError) return error.reason
  if (error instanceof DOMException && error.name === 'AbortError') return 'aborted'
  return 'corrupt'
}
