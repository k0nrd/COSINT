/**
 * §R2 v1.9 (aperçu bureautique) — lecteur ZIP minimal SANS dépendance, pour les
 * conteneurs OOXML (docx/xlsx/pptx), OpenDocument (odt/ods/odp) et iWork.
 *
 * Sécurité (archives venant de pairs NON FIABLES — « zip bomb ») :
 *  - répertoire central uniquement (End Of Central Directory → entrées), bornes vérifiées ;
 *  - au plus ZIP_LIMITS.maxEntries entrées ; zip64 / multi-volumes refusés proprement ;
 *  - entrées chiffrées refusées ('encrypted') ; méthodes autres que stockée (0) et
 *    deflate (8) refusées ('unsupported') ;
 *  - décompression en flux (DecompressionStream 'deflate-raw') ARRÊTÉE dès que la
 *    taille dépasse la limite de l'entrée ou le budget total de l'archive ('tooLarge') —
 *    la taille déclarée n'est jamais crue.
 */

export type ZipFailure = 'corrupt' | 'encrypted' | 'unsupported' | 'tooLarge' | 'aborted'

export class ZipError extends Error {
  readonly reason: ZipFailure
  constructor(reason: ZipFailure, message?: string) {
    super(message ?? reason)
    this.name = 'ZipError'
    this.reason = reason
  }
}

/** Limites dures (modifiables en test via le paramètre `limits`). */
export const ZIP_LIMITS = {
  maxEntries: 2000,
  /** Budget total décompressé pour toute la lecture de l'archive. */
  maxTotalInflated: 20 * 1024 * 1024,
  /** Taille maximale d'une entrée lue (XML ou image). */
  maxEntryBytes: 8 * 1024 * 1024
} as const

export type ZipLimits = { maxEntries: number; maxTotalInflated: number; maxEntryBytes: number }

export interface ZipEntry {
  name: string
  method: number
  encrypted: boolean
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

/** true si les octets commencent par une en-tête locale ZIP (« PK\x03\x04 »). */
export function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
}

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}
function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000
}

/** Normalise un nom d'entrée (« \ » → « / », sans « / » initial). */
export function normalizeZipName(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\/+/, '')
}

const nameDecoder = new TextDecoder('utf-8', { fatal: false })

/** Lit le répertoire central. Lève ZipError('corrupt' | 'unsupported' | 'tooLarge'). */
export function readZipDirectory(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Map<string, ZipEntry> {
  const len = bytes.length
  if (len < 22) throw new ZipError('corrupt')
  // EOCD : dans les 22 + 65535 derniers octets (commentaire d'archive max 64 Kio).
  let eocd = -1
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (u32(bytes, i) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ZipError('corrupt')
  const disk = u16(bytes, eocd + 4)
  const cdDisk = u16(bytes, eocd + 6)
  const count = u16(bytes, eocd + 10)
  const cdSize = u32(bytes, eocd + 12)
  const cdOffset = u32(bytes, eocd + 16)
  // zip64 (champs saturés) ou archive multi-volumes : refus propre.
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new ZipError('unsupported')
  if (disk !== 0 || cdDisk !== 0) throw new ZipError('unsupported')
  if (count > limits.maxEntries) throw new ZipError('tooLarge')
  if (cdOffset + cdSize > eocd) throw new ZipError('corrupt')

  const entries = new Map<string, ZipEntry>()
  let p = cdOffset
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || u32(bytes, p) !== SIG_CENTRAL) throw new ZipError('corrupt')
    const flags = u16(bytes, p + 8)
    const method = u16(bytes, p + 10)
    const compressedSize = u32(bytes, p + 20)
    const uncompressedSize = u32(bytes, p + 24)
    const nameLen = u16(bytes, p + 28)
    const extraLen = u16(bytes, p + 30)
    const commentLen = u16(bytes, p + 32)
    const localOffset = u32(bytes, p + 42)
    const end = p + 46 + nameLen + extraLen + commentLen
    if (end > eocd) throw new ZipError('corrupt')
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError('unsupported')
    }
    const name = normalizeZipName(nameDecoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)))
    // Premier gagnant en cas de doublon (évite qu'une entrée tardive masque la vraie).
    if (name && !entries.has(name)) {
      entries.set(name, {
        name,
        method,
        encrypted: (flags & 1) !== 0,
        compressedSize,
        uncompressedSize,
        localOffset
      })
    }
    p = end
  }
  return entries
}

/**
 * Décompresse du deflate brut en flux, en s'arrêtant au-delà de `max` octets :
 * refus ('tooLarge') par défaut, ou — `truncate` — préfixe de `max` octets conservé
 * (flux annulé, rien de plus n'est décompressé).
 */
export async function inflateRawBounded(
  data: Uint8Array,
  max: number,
  signal?: AbortSignal,
  truncate = false
): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  // Les promesses d'écriture sont rejetées si on annule la lecture : ignorées.
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined)
  writer.close().catch(() => undefined)
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      if (signal?.aborted) throw new ZipError('aborted')
      let step: ReadableStreamReadResult<Uint8Array>
      try {
        step = await reader.read()
      } catch {
        throw new ZipError('corrupt')
      }
      if (step.done) break
      if (total + step.value.length > max) {
        if (!truncate) throw new ZipError('tooLarge')
        // §R2 v1.9 — préfixe borné : on garde exactement `max` octets puis on arrête.
        const keep = step.value.subarray(0, max - total)
        chunks.push(keep)
        total += keep.length
        reader.cancel().catch(() => undefined)
        break
      }
      total += step.value.length
      chunks.push(step.value)
    }
  } catch (error) {
    reader.cancel().catch(() => undefined)
    throw error
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

/**
 * Archive ZIP ouverte : répertoire central lu une fois, lectures d'entrées bornées
 * par entrée ET par un budget total partagé (toutes lectures confondues).
 */
export class ZipArchive {
  readonly entries: Map<string, ZipEntry>
  private inflated = 0

  constructor(
    private readonly bytes: Uint8Array,
    private readonly limits: ZipLimits = ZIP_LIMITS,
    private readonly signal?: AbortSignal
  ) {
    this.entries = readZipDirectory(bytes, limits)
  }

  /** Budget de décompression encore disponible (octets). */
  get remaining(): number {
    return Math.max(0, this.limits.maxTotalInflated - this.inflated)
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  /** Nom réel d'une entrée, insensible à la casse (ex. « Thumbnails/thumbnail.png »). */
  find(name: string): string | null {
    if (this.entries.has(name)) return name
    const lower = name.toLowerCase()
    for (const key of this.entries.keys()) if (key.toLowerCase() === lower) return key
    return null
  }

  /** Octets décompressés d'une entrée (null si absente). */
  async read(name: string, maxBytes = this.limits.maxEntryBytes): Promise<Uint8Array | null> {
    const entry = this.entries.get(name)
    if (!entry) return null
    if (this.signal?.aborted) throw new ZipError('aborted')
    if (entry.encrypted) throw new ZipError('encrypted')
    const cap = Math.min(maxBytes, this.limits.maxEntryBytes, this.limits.maxTotalInflated - this.inflated)
    if (entry.uncompressedSize > cap) throw new ZipError('tooLarge')
    const raw = this.rawData(entry)
    let out: Uint8Array
    if (entry.method === 0) {
      if (raw.length > cap) throw new ZipError('tooLarge')
      out = raw
    } else if (entry.method === 8) {
      out = await inflateRawBounded(raw, cap, this.signal)
    } else {
      throw new ZipError('unsupported')
    }
    this.inflated += out.length
    return out
  }

  /**
   * §R2 v1.9 — préfixe décompressé d'une entrée, borné à `max` octets (et au budget
   * restant) : une grande feuille / un long document n'est plus refusé, on n'en lit que
   * le début (`cut` = true s'il en reste). Seul le budget TOTAL épuisé reste un refus.
   */
  async readPrefix(name: string, max = this.limits.maxEntryBytes): Promise<{ data: Uint8Array; cut: boolean } | null> {
    const entry = this.entries.get(name)
    if (!entry) return null
    if (this.signal?.aborted) throw new ZipError('aborted')
    if (entry.encrypted) throw new ZipError('encrypted')
    const cap = Math.min(max, this.limits.maxEntryBytes, this.limits.maxTotalInflated - this.inflated)
    if (cap <= 0) throw new ZipError('tooLarge')
    const raw = this.rawData(entry)
    let data: Uint8Array
    if (entry.method === 0) data = raw.length > cap ? raw.subarray(0, cap) : raw
    else if (entry.method === 8) data = await inflateRawBounded(raw, cap, this.signal, true)
    else throw new ZipError('unsupported')
    this.inflated += data.length
    // Coupé si le plafond est atteint et que l'entrée n'avait pas exactement cette taille
    // (taille déclarée non fiable : au pire, avertissement « tronqué » superflu).
    const cut = data.length >= cap && (entry.method === 0 ? raw.length > cap : entry.uncompressedSize !== cap)
    return { data, cut }
  }

  /** Octets bruts (compressés) d'une entrée, bornes vérifiées. */
  private rawData(entry: ZipEntry): Uint8Array {
    const b = this.bytes
    const lo = entry.localOffset
    if (lo + 30 > b.length || u32(b, lo) !== SIG_LOCAL) throw new ZipError('corrupt')
    const start = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28)
    const end = start + entry.compressedSize
    if (end > b.length) throw new ZipError('corrupt')
    return b.subarray(start, end)
  }

  /** Texte UTF-8 d'une entrée (null si absente). */
  async readText(name: string, maxBytes?: number): Promise<string | null> {
    const data = await this.read(name, maxBytes)
    return data ? new TextDecoder('utf-8', { fatal: false }).decode(data) : null
  }
}
