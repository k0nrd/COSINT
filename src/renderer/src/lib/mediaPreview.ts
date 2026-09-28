/**
 * §R2 v1.9 (aperçu audio/vidéo) — fonctions PURES autour des fichiers son et vidéo
 * importés sur le tableau : métadonnées (durée, titre, artiste, album — ID3/Vorbis/
 * MP4, lecture bornée des octets), MIME de lecture déduit de l'extension, formatage.
 * Le média est lu par un <audio>/<video> natif (data:/blob: URL) ; jamais de script.
 *
 * Les octets viennent de pairs NON FIABLES : toute lecture est bornée (tailles,
 * nombre de trames/blocs, longueur des textes) et ne lève jamais d'exception.
 */

/** Informations d'un média (toutes optionnelles sauf le MIME de lecture). */
export type MediaInfo = {
  durationSec?: number
  title?: string
  artist?: string
  album?: string
  /** MIME utilisé pour la lecture (ex. 'audio/mpeg'). */
  mime: string
  /** Pochette intégrée (data:image/png|jpeg, bornée) si présente. */
  cover?: string
}

/** MIME de lecture par extension (clés propres uniquement). */
const PLAYBACK_MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  weba: 'audio/webm',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime'
}

/** MIME de lecture : le MIME déclaré s'il est audio/ ou video/, sinon celui de l'extension. */
export function playbackMime(mime: string, ext: string): string {
  const type = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : ''
  if (type.startsWith('audio/') || type.startsWith('video/')) return type
  const key = typeof ext === 'string' ? ext.toLowerCase() : ''
  return Object.prototype.hasOwnProperty.call(PLAYBACK_MIME_BY_EXT, key) ? PLAYBACK_MIME_BY_EXT[key] : ''
}


// ——— Bornes ———

/** Taille max d'une pochette intégrée convertie en vignette. */
export const MAX_COVER_BYTES = 2 * 1024 * 1024
/** Longueur max d'un champ texte (titre, artiste, album). */
export const MAX_TAG_CHARS = 300
/** Nombre max de trames ID3 / blocs FLAC / commentaires parcourus. */
const MAX_FRAMES = 512
/** Fenêtre de recherche des commentaires Vorbis/Opus dans un OGG. */
const OGG_SCAN_BYTES = 256 * 1024

// ——— Reconnaissance par signature (octets magiques) ———

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = offset; i < offset + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i])
  return out
}

function indexOfAscii(bytes: Uint8Array, needle: string, from: number, to: number): number {
  const end = Math.min(bytes.length, to) - needle.length
  outer: for (let i = Math.max(0, from); i <= end; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

/** Taille « syncsafe » (7 bits utiles par octet) d'ID3v2. */
function syncsafe(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f)
}

/** Octet de synchronisation de trame MPEG audio (couche I/II/III, pas ADTS). */
function isMpegFrameSync(bytes: Uint8Array, offset: number): boolean {
  if (offset + 1 >= bytes.length) return false
  const b1 = bytes[offset + 1]
  return bytes[offset] === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0 && (b1 & 0x18) !== 0x08
}

function isAdtsSync(bytes: Uint8Array, offset: number): boolean {
  return offset + 1 < bytes.length && bytes[offset] === 0xff && (bytes[offset + 1] & 0xf6) === 0xf0
}

/**
 * MIME réel d'un média d'après ses premiers octets ('' si inconnu). `kind` départage
 * les conteneurs mixtes (OGG, MP4/ftyp, WebM) : audio ou vidéo.
 */
export function sniffMediaMime(bytes: Uint8Array, kind: 'audio' | 'video' = 'audio'): string {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) return ''
  let start = 0
  // Balise ID3v2 en tête (MP3, parfois AAC/FLAC) : on regarde ce qui suit.
  if (ascii(bytes, 0, 3) === 'ID3' && bytes.length >= 10) {
    const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0
    start = 10 + syncsafe(bytes, 6) + footer
    if (ascii(bytes, start, 4) === 'fLaC') return 'audio/flac'
    if (isAdtsSync(bytes, start)) return 'audio/aac'
    return 'audio/mpeg'
  }
  const head4 = ascii(bytes, 0, 4)
  if (head4 === 'fLaC') return 'audio/flac'
  if (head4 === 'RIFF' && bytes.length >= 12) {
    const form = ascii(bytes, 8, 4)
    if (form === 'WAVE') return 'audio/wav'
    if (form === 'AVI ') return 'video/x-msvideo'
    return ''
  }
  if (head4 === 'OggS') {
    const firstPage = Math.min(bytes.length, 512)
    if (indexOfAscii(bytes, '\x80theora', 0, firstPage) >= 0) return 'video/ogg'
    if (indexOfAscii(bytes, 'OpusHead', 0, firstPage) >= 0 || indexOfAscii(bytes, '\x01vorbis', 0, firstPage) >= 0) {
      return kind === 'video' ? 'video/ogg' : 'audio/ogg'
    }
    return kind === 'video' ? 'video/ogg' : 'audio/ogg'
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const isWebm = indexOfAscii(bytes, 'webm', 4, 64) >= 0
    if (!isWebm) return indexOfAscii(bytes, 'matroska', 4, 64) >= 0 ? 'video/x-matroska' : ''
    return kind === 'audio' ? 'audio/webm' : 'video/webm'
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (brand === 'qt  ') return 'video/quicktime'
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ' || brand === 'F4A ') return 'audio/mp4'
    return kind === 'audio' ? 'audio/mp4' : 'video/mp4'
  }
  if (isAdtsSync(bytes, 0)) return 'audio/aac'
  if (isMpegFrameSync(bytes, 0)) return 'audio/mpeg'
  return ''
}

/** Durée lisible : « 3:24 » ou « 1:02:03 » ('' si inconnue). */
export function formatDuration(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// ——— Textes et pochettes ———

/** Métadonnées textuelles d'une balise (ID3, Vorbis). */
export type MediaTags = {
  title?: string
  artist?: string
  album?: string
  /** Pochette (data: URL png/jpeg) — seulement si l'image est valide et bornée. */
  cover?: string
}

function decodeText(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

/** Nettoie un champ : caractères de contrôle retirés, espaces réduits, longueur bornée. */
export function cleanTag(value: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > MAX_TAG_CHARS ? text.slice(0, MAX_TAG_CHARS) + '…' : text
}

/** Décode une chaîne ID3 selon l'octet d'encodage (0 latin1, 1 UTF-16+BOM, 2 UTF-16BE, 3 UTF-8). */
export function decodeId3Text(encoding: number, data: Uint8Array): string {
  let text: string
  if (encoding === 1 || encoding === 2) {
    let body = data
    let le = encoding === 1 // sans BOM : petit-boutiste par défaut (usage le plus courant)
    if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) {
      le = true
      body = body.subarray(2)
    } else if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) {
      le = false
      body = body.subarray(2)
    }
    text = decodeText(body.subarray(0, body.length - (body.length % 2)), le ? 'utf-16le' : 'utf-16be')
  } else if (encoding === 3) {
    text = decodeText(data, 'utf-8')
  } else {
    text = decodeText(data, 'latin1')
  }
  // Plusieurs valeurs séparées par NUL (ID3v2.4) : on les joint.
  return text.split('\u0000').map((part) => part.trim()).filter(Boolean).join(' / ')
}

/** Fin d'une chaîne terminée par NUL (double NUL aligné en UTF-16). -1 si absente. */
function findTerminator(data: Uint8Array, from: number, encoding: number): number {
  const wide = encoding === 1 || encoding === 2
  for (let i = from; i < data.length; i += wide ? 2 : 1) {
    if (wide) {
      if (i + 1 < data.length && data[i] === 0 && data[i + 1] === 0) return i
    } else if (data[i] === 0) return i
  }
  return -1
}

const BASE64_CHUNK = 0x8000

/** Octets → base64 (par tranches, sans chaîne géante). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

/** Pochette → data: URL, seulement si les octets sont VRAIMENT du PNG/JPEG et bornés. */
export function coverDataUrl(data: Uint8Array): string | undefined {
  if (data.length < 8 || data.length > MAX_COVER_BYTES) return undefined
  let mime = ''
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) mime = 'image/jpeg'
  else if (data[0] === 0x89 && ascii(data, 1, 3) === 'PNG' && data[4] === 0x0d && data[5] === 0x0a) mime = 'image/png'
  if (!mime) return undefined
  return `data:${mime};base64,${bytesToBase64(data)}`
}

/** Retire la désynchronisation ID3 (0xFF 0x00 → 0xFF). */
export function removeUnsync(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length)
  let n = 0
  for (let i = 0; i < data.length; i++) {
    out[n++] = data[i]
    if (data[i] === 0xff && i + 1 < data.length && data[i + 1] === 0x00) i++
  }
  return out.subarray(0, n)
}

// ——— ID3 ———

const ID3_TEXT_FIELDS: Record<string, keyof Omit<MediaTags, 'cover'>> = {
  TIT2: 'title', TT2: 'title',
  TPE1: 'artist', TP1: 'artist',
  TALB: 'album', TAL: 'album'
}

/** Pochette d'une trame APIC (v2.3/2.4) ou PIC (v2.2) : { type d'image, octets }. */
function parsePictureFrame(body: Uint8Array, v22: boolean): { type: number; data: Uint8Array } | null {
  if (body.length < 4) return null
  const encoding = body[0]
  let pos: number
  if (v22) {
    pos = 4 // encodage + format sur 3 caractères (JPG/PNG)
  } else {
    const mimeEnd = findTerminator(body, 1, 0)
    if (mimeEnd < 0) return null
    pos = mimeEnd + 1
  }
  if (pos >= body.length) return null
  const type = body[pos++]
  const descEnd = findTerminator(body, pos, encoding)
  if (descEnd < 0) return null
  pos = descEnd + (encoding === 1 || encoding === 2 ? 2 : 1)
  return pos < body.length ? { type, data: body.subarray(pos) } : null
}

/** Balise ID3v2 (v2.2/2.3/2.4) en tête de fichier ; null si absente ou illisible. */
export function parseId3v2(bytes: Uint8Array): MediaTags | null {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== 'ID3') return null
  const major = bytes[3]
  if (major < 2 || major > 4 || bytes[4] === 0xff) return null
  const flags = bytes[5]
  const size = syncsafe(bytes, 6)
  let tag = bytes.subarray(10, Math.min(bytes.length, 10 + size))
  const tagUnsync = (flags & 0x80) !== 0
  // v2.2/2.3 : désynchronisation au niveau de la balise ; v2.4 : par trame.
  if (tagUnsync && major < 4) tag = removeUnsync(tag)
  let pos = 0
  if ((flags & 0x40) !== 0 && major >= 3 && tag.length >= 4) {
    const ext = major === 4 ? syncsafe(tag, 0) : ((tag[0] << 24) | (tag[1] << 16) | (tag[2] << 8) | tag[3]) + 4
    pos = ext > 0 && ext <= tag.length ? ext : tag.length
  }
  const v22 = major === 2
  const headerLen = v22 ? 6 : 10
  const tags: MediaTags = {}
  let cover: { type: number; data: Uint8Array } | null = null
  for (let frames = 0; frames < MAX_FRAMES && pos + headerLen <= tag.length; frames++) {
    if (tag[pos] === 0) break // remplissage
    const id = ascii(tag, pos, v22 ? 3 : 4)
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break
    let frameSize: number
    let formatFlags = 0
    if (v22) frameSize = (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5]
    else if (major === 4) frameSize = syncsafe(tag, pos + 4)
    else frameSize = ((tag[pos + 4] << 24) | (tag[pos + 5] << 16) | (tag[pos + 6] << 8) | tag[pos + 7]) >>> 0
    if (!v22) formatFlags = tag[pos + 9]
    const start = pos + headerLen
    const end = start + frameSize
    if (frameSize <= 0 || end > tag.length) break
    pos = end
    // Trames compressées ou chiffrées (v2.3 : 0x80/0x40 ; v2.4 : 0x08/0x04) : ignorées.
    if (major === 3 && (formatFlags & 0xc0) !== 0) continue
    if (major === 4 && (formatFlags & 0x0c) !== 0) continue
    let body = tag.subarray(start, end)
    if (major === 3 && (formatFlags & 0x20) !== 0) body = body.subarray(1) // octet d'identité de groupe
    if (major === 4) {
      if ((formatFlags & 0x40) !== 0) body = body.subarray(1)
      if ((formatFlags & 0x01) !== 0) body = body.subarray(4) // longueur de données
      if ((formatFlags & 0x02) !== 0 || tagUnsync) body = removeUnsync(body)
    }
    const field = ID3_TEXT_FIELDS[id]
    if (field && body.length > 1 && tags[field] === undefined) {
      tags[field] = cleanTag(decodeId3Text(body[0], body.subarray(1, 1 + MAX_TAG_CHARS * 4)))
    } else if ((id === 'APIC' || id === 'PIC') && (!cover || cover.type !== 3)) {
      const picture = parsePictureFrame(body, v22)
      if (picture && coverDataUrl(picture.data) && (!cover || picture.type === 3)) cover = picture
    }
  }
  if (cover) tags.cover = coverDataUrl(cover.data)
  return tags
}

/** Balise ID3v1 (128 derniers octets « TAG ») ; null si absente. */
export function parseId3v1(bytes: Uint8Array): MediaTags | null {
  if (bytes.length < 128) return null
  const base = bytes.length - 128
  if (ascii(bytes, base, 3) !== 'TAG') return null
  const field = (offset: number): string | undefined => {
    const raw = bytes.subarray(base + offset, base + offset + 30)
    const nul = raw.indexOf(0)
    return cleanTag(decodeText(nul >= 0 ? raw.subarray(0, nul) : raw, 'latin1'))
  }
  return { title: field(3), artist: field(33), album: field(63) }
}

// ——— Commentaires Vorbis (FLAC, OGG Vorbis/Opus) ———

function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}

/** Bloc de commentaires Vorbis (longueur fournisseur + N « CLÉ=valeur » UTF-8). */
export function parseVorbisComments(block: Uint8Array): MediaTags {
  const tags: MediaTags = {}
  if (block.length < 8) return tags
  let pos = 4 + u32le(block, 0)
  if (pos + 4 > block.length) return tags
  const count = Math.min(u32le(block, pos), MAX_FRAMES)
  pos += 4
  for (let i = 0; i < count && pos + 4 <= block.length; i++) {
    const len = u32le(block, pos)
    pos += 4
    if (len > block.length - pos) break
    const entry = block.subarray(pos, pos + Math.min(len, MAX_TAG_CHARS * 4 + 16))
    pos += len
    const eq = entry.indexOf(0x3d)
    if (eq <= 0) continue
    const key = ascii(entry, 0, eq).toUpperCase()
    const field = key === 'TITLE' ? 'title' : key === 'ARTIST' ? 'artist' : key === 'ALBUM' ? 'album' : null
    if (field && tags[field] === undefined) tags[field] = cleanTag(decodeText(entry.subarray(eq + 1), 'utf-8'))
  }
  return tags
}

/** FLAC : blocs de métadonnées (commentaires + image) et durée (STREAMINFO). */
export function parseFlac(bytes: Uint8Array): (MediaTags & { durationSec?: number }) | null {
  let pos = 0
  if (ascii(bytes, 0, 3) === 'ID3' && bytes.length >= 10) pos = 10 + syncsafe(bytes, 6)
  if (ascii(bytes, pos, 4) !== 'fLaC') return null
  pos += 4
  const out: MediaTags & { durationSec?: number } = {}
  for (let blocks = 0; blocks < MAX_FRAMES && pos + 4 <= bytes.length; blocks++) {
    const header = bytes[pos]
    const len = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]
    const start = pos + 4
    const end = start + len
    if (end > bytes.length) break
    const body = bytes.subarray(start, end)
    const type = header & 0x7f
    if (type === 0 && len >= 18) {
      const rate = (body[10] << 12) | (body[11] << 4) | (body[12] >> 4)
      const samples = (body[13] & 0x0f) * 2 ** 32 + u32be(body, 14)
      if (rate > 0 && samples > 0) out.durationSec = samples / rate
    } else if (type === 4) {
      Object.assign(out, parseVorbisComments(body))
    } else if (type === 6 && !out.cover && len >= 32) {
      let p = 4
      p += 4 + u32be(body, p) // MIME
      if (p + 4 > len) break
      p += 4 + u32be(body, p) // description
      p += 16 // largeur, hauteur, profondeur, couleurs
      if (p + 4 <= len) {
        const dataLen = u32be(body, p)
        if (dataLen <= len - p - 4) out.cover = coverDataUrl(body.subarray(p + 4, p + 4 + dataLen))
      }
    }
    pos = end
    if ((header & 0x80) !== 0) break // dernier bloc
  }
  return out
}

/** OGG : commentaires du 2e paquet (Vorbis « \x03vorbis » ou « OpusTags »), recherche bornée. */
export function parseOggComments(bytes: Uint8Array): MediaTags | null {
  if (ascii(bytes, 0, 4) !== 'OggS') return null
  const window = Math.min(bytes.length, OGG_SCAN_BYTES)
  const opus = indexOfAscii(bytes, 'OpusTags', 0, window)
  if (opus >= 0) return parseVorbisComments(bytes.subarray(opus + 8, window))
  const vorbis = indexOfAscii(bytes, '\x03vorbis', 0, window)
  if (vorbis >= 0) return parseVorbisComments(bytes.subarray(vorbis + 7, window))
  return null
}

// ——— Synthèse ———

function mergeTags(target: MediaInfo, tags: MediaTags | null): void {
  if (!tags) return
  if (!target.title && tags.title) target.title = tags.title
  if (!target.artist && tags.artist) target.artist = tags.artist
  if (!target.album && tags.album) target.album = tags.album
  if (!target.cover && tags.cover) target.cover = tags.cover
}

/**
 * Métadonnées d'un média : MIME de lecture (signature d'abord, puis MIME déclaré /
 * extension), titre/artiste/album/pochette (ID3v2, ID3v1, FLAC, OGG), durée FLAC.
 * Ne lève jamais : un fichier piégé donne simplement moins d'informations.
 */
export function parseMediaInfo(bytes: Uint8Array, ext: string, mime: string, kind?: 'audio' | 'video'): MediaInfo {
  const fallbackMime = playbackMime(mime, ext)
  const mediaKind = kind ?? (fallbackMime.startsWith('video/') ? 'video' : 'audio')
  const info: MediaInfo = { mime: sniffMediaMime(bytes, mediaKind) || fallbackMime }
  try {
    mergeTags(info, parseId3v2(bytes))
    const flac = parseFlac(bytes)
    if (flac) {
      mergeTags(info, flac)
      if (flac.durationSec !== undefined) info.durationSec = flac.durationSec
    }
    mergeTags(info, parseOggComments(bytes))
    mergeTags(info, parseId3v1(bytes))
  } catch {
    // Octets hostiles : on garde ce qui a déjà été lu.
  }
  return info
}
