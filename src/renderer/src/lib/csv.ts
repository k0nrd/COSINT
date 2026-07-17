/**
 * Analyse et génération de CSV (§1 v1.7) — pur, sans dépendance au modèle.
 *
 * Conforme RFC 4180 à la lecture : champs entre guillemets, guillemet doublé (`""`)
 * échappé, séparateur/​retour à la ligne à l'intérieur des guillemets, fins de ligne
 * CRLF ou LF. Détection automatique du séparateur (`,` `;` tabulation) et de la
 * présence d'une ligne d'en-tête. À l'écriture : guillemets seulement si nécessaires,
 * BOM UTF-8 optionnel (pour Excel), fins de ligne CRLF.
 */

export type CsvDelimiter = ',' | ';' | '\t'

const DELIMITERS: CsvDelimiter[] = [',', ';', '\t']

export interface ParsedCsv {
  /** En-tête détecté (ou null si absent). */
  header: string[] | null
  /** Lignes de données (hors en-tête). */
  rows: string[][]
  delimiter: CsvDelimiter
  hasHeader: boolean
}

/** Détecte le séparateur le plus probable sur la première ligne (hors guillemets). */
export function detectDelimiter(sample: string): CsvDelimiter {
  const firstLine = sample.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) counts[ch] += 1
  }
  let best: CsvDelimiter = ','
  let bestCount = -1
  for (const delimiter of DELIMITERS) {
    if (counts[delimiter] > bestCount) {
      bestCount = counts[delimiter]
      best = delimiter
    }
  }
  return best
}

/** Découpe le texte en enregistrements (machine à états RFC 4180). */
function tokenize(text: string, delimiter: CsvDelimiter): string[][] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let started = false // au moins un caractère vu sur l'enregistrement courant

  const pushField = (): void => {
    record.push(field)
    field = ''
  }
  const pushRecord = (): void => {
    pushField()
    records.push(record)
    record = []
    started = false
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      started = true
    } else if (ch === delimiter) {
      pushField()
      started = true
    } else if (ch === '\n') {
      pushRecord()
    } else if (ch === '\r') {
      // Fin de ligne CRLF : le \n suivant est consommé au tour d'après.
      if (text[i + 1] === '\n') i += 1
      pushRecord()
    } else {
      field += ch
      started = true
    }
  }
  // Dernier enregistrement (sauf s'il est totalement vide → fichier terminé par \n).
  if (started || field !== '' || record.length > 0) pushRecord()
  return records
}

/** Devine si le premier enregistrement est un en-tête (toutes cellules non vides et
 *  non purement numériques). Heuristique conservatrice, surchargée en mode assisté. */
export function guessHasHeader(records: string[][]): boolean {
  if (records.length === 0) return false
  const first = records[0]
  if (first.length === 0) return false
  const looksLikeHeader = first.every(
    (cell) => cell.trim() !== '' && !/^[-+]?\d[\d\s.,]*$/.test(cell.trim())
  )
  return looksLikeHeader
}

/**
 * Analyse un CSV. Sépare l'en-tête (si présent) des lignes de données. Le séparateur
 * et la présence d'en-tête sont détectés si non fournis. Le BOM UTF-8 est retiré.
 */
export function parseCsv(
  input: string,
  options: { delimiter?: CsvDelimiter; hasHeader?: boolean } = {}
): ParsedCsv {
  const text = input.replace(/^\uFEFF/, '')
  const delimiter = options.delimiter ?? detectDelimiter(text)
  const records = tokenize(text, delimiter).filter(
    (record) => !(record.length === 1 && record[0] === '')
  )
  const hasHeader = options.hasHeader ?? guessHasHeader(records)
  if (records.length === 0) return { header: null, rows: [], delimiter, hasHeader: false }
  if (hasHeader) return { header: records[0], rows: records.slice(1), delimiter, hasHeader: true }
  return { header: null, rows: records, delimiter, hasHeader: false }
}

/** Échappe une cellule pour l'écriture (guillemets seulement si nécessaires). */
export function csvCell(value: string, delimiter: CsvDelimiter): string {
  if (value === '') return ''
  if (value.includes('"') || value.includes(delimiter) || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Génère un CSV depuis une matrice de chaînes. BOM UTF-8 optionnel (Excel), fins de
 * ligne CRLF. La première ligne peut être l'en-tête (à la charge de l'appelant).
 */
export function stringifyCsv(
  rows: string[][],
  options: { delimiter?: CsvDelimiter; bom?: boolean } = {}
): string {
  const delimiter = options.delimiter ?? ','
  const eol = '\r\n'
  const body = rows.map((row) => row.map((cell) => csvCell(cell ?? '', delimiter)).join(delimiter)).join(eol)
  const prefix = options.bom ? '\uFEFF' : ''
  return rows.length > 0 ? `${prefix}${body}${eol}` : prefix
}
