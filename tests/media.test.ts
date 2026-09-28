// §R2 v1.9 — aperçu audio/vidéo : signature des médias et lecture des balises (ID3, Vorbis).
import { describe, expect, it } from 'vitest'
import {
  cleanTag,
  coverDataUrl,
  decodeId3Text,
  formatDuration,
  parseFlac,
  parseId3v1,
  parseId3v2,
  parseMediaInfo,
  parseOggComments,
  parseVorbisComments,
  removeUnsync,
  sniffMediaMime,
  MAX_COVER_BYTES,
  MAX_TAG_CHARS
} from '@/lib/mediaPreview'

const enc = (s: string): number[] => Array.from(new TextEncoder().encode(s))
const latin1 = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 0xff)
const utf16le = (s: string): number[] => {
  const out = [0xff, 0xfe]
  for (const c of s) {
    const code = c.charCodeAt(0)
    out.push(code & 0xff, code >> 8)
  }
  return out
}
const syncsafe = (n: number): number[] => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const le32 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const pad = (bytes: number[], length: number): number[] => [...bytes, ...new Array(Math.max(0, length - bytes.length)).fill(0)]

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]

function frame23(id: string, body: number[], flags = [0, 0]): number[] {
  return [...latin1(id), ...be32(body.length), ...flags, ...body]
}
function frame24(id: string, body: number[], flags = [0, 0]): number[] {
  return [...latin1(id), ...syncsafe(body.length), ...flags, ...body]
}
function id3(major: number, frames: number[], flags = 0): Uint8Array {
  return new Uint8Array([...latin1('ID3'), major, 0, flags, ...syncsafe(frames.length), ...frames])
}

describe('sniffMediaMime', () => {
  it('reconnaît les signatures audio', () => {
    expect(sniffMediaMime(id3(3, pad([], 16)))).toBe('audio/mpeg')
    expect(sniffMediaMime(new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0]))).toBe('audio/mpeg')
    expect(sniffMediaMime(new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0, 0]))).toBe('audio/aac')
    expect(sniffMediaMime(new Uint8Array([...latin1('RIFF'), 0, 0, 0, 0, ...latin1('WAVE')]))).toBe('audio/wav')
    expect(sniffMediaMime(new Uint8Array([...latin1('fLaC'), 0, 0, 0, 0]))).toBe('audio/flac')
    expect(sniffMediaMime(new Uint8Array(pad([...latin1('OggS'), ...latin1('OpusHead')], 40)))).toBe('audio/ogg')
  })

  it('reconnaît les conteneurs vidéo et départage audio/vidéo', () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, ...latin1('ftypisom'), 0, 0, 0, 0])
    expect(sniffMediaMime(mp4, 'video')).toBe('video/mp4')
    expect(sniffMediaMime(mp4, 'audio')).toBe('audio/mp4')
    expect(sniffMediaMime(new Uint8Array([0, 0, 0, 0x18, ...latin1('ftypM4A '), 0, 0, 0, 0]), 'video')).toBe('audio/mp4')
    expect(sniffMediaMime(new Uint8Array([0, 0, 0, 0x14, ...latin1('ftypqt  '), 0, 0, 0, 0]), 'video')).toBe('video/quicktime')
    const webm = new Uint8Array(pad([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...latin1('webm')], 32))
    expect(sniffMediaMime(webm, 'video')).toBe('video/webm')
    expect(sniffMediaMime(webm, 'audio')).toBe('audio/webm')
    const theora = new Uint8Array(pad([...latin1('OggS'), 0, 0, 0x80, ...latin1('theora')], 64))
    expect(sniffMediaMime(theora, 'audio')).toBe('video/ogg')
  })

  it('renvoie une chaîne vide pour un contenu inconnu ou trop court', () => {
    expect(sniffMediaMime(new Uint8Array([1, 2]))).toBe('')
    expect(sniffMediaMime(new Uint8Array(enc('<html><script>')))).toBe('')
    expect(sniffMediaMime(new Uint8Array([...latin1('RIFF'), 0, 0, 0, 0, ...latin1('XXXX')]))).toBe('')
  })
})

describe('formatDuration', () => {
  it('formate minutes et heures', () => {
    expect(formatDuration(204.7)).toBe('3:24')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(Infinity)).toBe('')
  })
})

describe('ID3v2', () => {
  it('lit TIT2/TPE1/TALB en v2.3 (latin1, UTF-16 avec BOM, UTF-8)', () => {
    const tag = id3(3, [
      ...frame23('TIT2', [0, ...latin1('Caf\xe9 du port')]),
      ...frame23('TPE1', [1, ...utf16le('Zoé Martin'), 0, 0]),
      ...frame23('TALB', [3, ...enc('Été — live'), 0]),
      0, 0, 0, 0
    ])
    expect(parseId3v2(tag)).toEqual({ title: 'Café du port', artist: 'Zoé Martin', album: 'Été — live' })
  })

  it('lit une balise v2.4 (taille syncsafe, indicateur de longueur, valeurs multiples)', () => {
    const body = [3, ...enc('Un'), 0, ...enc('Deux')]
    const tag = id3(4, [...frame24('TPE1', [...syncsafe(body.length), ...body], [0, 0x01]), ...frame24('TIT2', [3, ...enc('Titre')])])
    expect(parseId3v2(tag)).toEqual({ artist: 'Un / Deux', title: 'Titre' })
  })

  it('lit une balise v2.2 (identifiants sur 3 caractères)', () => {
    const body = [0, ...latin1('Ancien')]
    const tag = id3(2, [...latin1('TT2'), 0, 0, body.length, ...body])
    expect(parseId3v2(tag)?.title).toBe('Ancien')
  })

  it('annule la désynchronisation de la balise (v2.3)', () => {
    expect(Array.from(removeUnsync(new Uint8Array([0xff, 0x00, 0xe0, 0x41])))).toEqual([0xff, 0xe0, 0x41])
    // Trame UTF-16 (BOM 0xFF 0xFE, « ÿ » = 0xFF 0x00) puis désynchronisation : 0x00 inséré après chaque 0xFF.
    const raw = frame23('TIT2', [1, 0xff, 0xfe, 0x41, 0x00, 0xff, 0x00])
    const unsynced = raw.flatMap((b, i) => (b === 0xff && (raw[i + 1] === undefined || raw[i + 1] >= 0xe0 || raw[i + 1] === 0) ? [b, 0] : [b]))
    expect(parseId3v2(id3(3, unsynced, 0x80))?.title).toBe('Aÿ')
  })

  it('extrait la pochette APIC (couverture préférée) et refuse une image non PNG/JPEG', () => {
    const apic = (type: number, data: number[]): number[] =>
      frame23('APIC', [0, ...latin1('image/jpeg'), 0, type, ...latin1('desc'), 0, ...data])
    const tag = parseId3v2(id3(3, [...apic(0, PNG), ...apic(3, JPEG)]))
    expect(tag?.cover).toBe(`data:image/jpeg;base64,${btoa(String.fromCharCode(...JPEG))}`)
    const bad = parseId3v2(id3(3, apic(3, enc('<svg onload=alert(1)>'))))
    expect(bad?.cover).toBeUndefined()
  })

  it('résiste aux balises tronquées ou hostiles', () => {
    expect(parseId3v2(new Uint8Array(latin1('ID3')))).toBeNull()
    expect(parseId3v2(new Uint8Array([...latin1('ID3'), 9, 0, 0, 0, 0, 0, 10]))).toBeNull()
    // Trame annonçant une taille énorme : ignorée sans lever.
    const huge = new Uint8Array([...latin1('ID3'), 3, 0, 0, ...syncsafe(20), ...latin1('TIT2'), 0x7f, 0xff, 0xff, 0xff, 0, 0, 0, 65, 66])
    expect(parseId3v2(huge)).toEqual({})
    // Trame compressée (v2.3 drapeau 0x80) : ignorée.
    expect(parseId3v2(id3(3, frame23('TIT2', [0, 65], [0, 0x80])))).toEqual({})
  })

  it('borne la longueur des champs et retire les caractères de contrôle', () => {
    const long = 'x'.repeat(5000)
    expect(parseId3v2(id3(3, frame23('TIT2', [0, ...latin1(long)])))?.title?.length).toBe(MAX_TAG_CHARS + 1)
    expect(cleanTag('a\u0007b‮ c')).toBe('a b c')
    expect(cleanTag('   ')).toBeUndefined()
    expect(decodeId3Text(2, new Uint8Array([0, 0x41, 0, 0x42]))).toBe('AB')
  })
})

describe('ID3v1', () => {
  it('lit TAG dans les 128 derniers octets', () => {
    const tail = [...latin1('TAG'), ...pad(latin1('Titre v1'), 30), ...pad(latin1('Artiste'), 30), ...pad(latin1('Album'), 30), ...pad([], 35)]
    const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...tail])
    expect(parseId3v1(bytes)).toEqual({ title: 'Titre v1', artist: 'Artiste', album: 'Album' })
    expect(parseId3v1(new Uint8Array(200))).toBeNull()
  })
})

function vorbisBlock(entries: string[]): number[] {
  const vendor = enc('libtest')
  const out = [...le32(vendor.length), ...vendor, ...le32(entries.length)]
  for (const e of entries) {
    const b = enc(e)
    out.push(...le32(b.length), ...b)
  }
  return out
}

describe('commentaires Vorbis (FLAC / OGG)', () => {
  it('lit TITLE/ARTIST/ALBUM sans tenir compte de la casse des clés', () => {
    const tags = parseVorbisComments(new Uint8Array(vorbisBlock(['title=Chanson', 'ARTIST=Groupe', 'Album=Disque', 'GENRE=x'])))
    expect(tags).toEqual({ title: 'Chanson', artist: 'Groupe', album: 'Disque' })
  })

  it('résiste à un nombre de commentaires ou une longueur mensongers', () => {
    const lying = new Uint8Array([...le32(0), ...le32(0xffffffff), ...le32(0xfffffff0), 65])
    expect(parseVorbisComments(lying)).toEqual({})
    expect(parseVorbisComments(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0]))).toEqual({})
  })

  it('FLAC : durée STREAMINFO, commentaires et image', () => {
    const streaminfo = new Array(34).fill(0)
    // 44 100 Hz sur 20 bits (octets 10-12), 441 000 échantillons (octets 13-17) → 10 s.
    streaminfo[10] = (44100 >> 12) & 0xff
    streaminfo[11] = (44100 >> 4) & 0xff
    streaminfo[12] = (44100 & 0x0f) << 4
    streaminfo.splice(14, 4, ...be32(441000))
    const comments = vorbisBlock(['TITLE=Piste'])
    const mimeB = latin1('image/png')
    const picture = [...be32(3), ...be32(mimeB.length), ...mimeB, ...be32(0), ...new Array(16).fill(0), ...be32(PNG.length), ...PNG]
    const blk = (type: number, body: number[], last = false): number[] => [(last ? 0x80 : 0) | type, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff, ...body]
    const flac = new Uint8Array([...latin1('fLaC'), ...blk(0, streaminfo), ...blk(4, comments), ...blk(6, picture, true)])
    const out = parseFlac(flac)
    expect(out?.durationSec).toBe(10)
    expect(out?.title).toBe('Piste')
    expect(out?.cover?.startsWith('data:image/png;base64,')).toBe(true)
    expect(parseMediaInfo(flac, 'flac', '').durationSec).toBe(10)
  })

  it('OGG : commentaires Opus', () => {
    const ogg = new Uint8Array([...latin1('OggS'), ...pad([], 24), ...latin1('OpusHead'), 1, 2, ...latin1('OggS'), ...latin1('OpusTags'), ...vorbisBlock(['ARTIST=Voix'])])
    expect(parseOggComments(ogg)?.artist).toBe('Voix')
    expect(parseMediaInfo(ogg, 'opus', 'application/octet-stream')).toMatchObject({ mime: 'audio/ogg', artist: 'Voix' })
  })
})

describe('parseMediaInfo / coverDataUrl', () => {
  it('préfère la signature au MIME déclaré et à l’extension', () => {
    const wav = new Uint8Array([...latin1('RIFF'), 0, 0, 0, 0, ...latin1('WAVE'), 0, 0])
    expect(parseMediaInfo(wav, 'mp3', 'audio/mpeg').mime).toBe('audio/wav')
    expect(parseMediaInfo(new Uint8Array(16), 'mp4', '').mime).toBe('video/mp4')
    expect(parseMediaInfo(new Uint8Array(16), 'xyz', '').mime).toBe('')
  })

  it('combine ID3v2 et ID3v1 (v2 prioritaire)', () => {
    const v2 = Array.from(id3(3, frame23('TIT2', [0, ...latin1('Titre v2')])))
    const v1 = [...latin1('TAG'), ...pad(latin1('Titre v1'), 30), ...pad(latin1('Artiste v1'), 30), ...pad([], 65)]
    const info = parseMediaInfo(new Uint8Array([...v2, 0xff, 0xfb, 0x90, 0x64, ...v1]), 'mp3', '')
    expect(info).toMatchObject({ mime: 'audio/mpeg', title: 'Titre v2', artist: 'Artiste v1' })
  })

  it('borne la taille des pochettes', () => {
    expect(coverDataUrl(new Uint8Array(JPEG))).toMatch(/^data:image\/jpeg;base64,/)
    const big = new Uint8Array(MAX_COVER_BYTES + 1)
    big.set(JPEG)
    expect(coverDataUrl(big)).toBeUndefined()
    expect(coverDataUrl(new Uint8Array(enc('GIF89a....')))).toBeUndefined()
  })

  it('ne lève jamais sur des octets aléatoires', () => {
    let seed = 7
    for (let n = 0; n < 200; n++) {
      const bytes = new Uint8Array(64 + (n % 50))
      for (let i = 0; i < bytes.length; i++) bytes[i] = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff
      if (n % 3 === 0) bytes.set(latin1('ID3\x03\x00\x00'))
      if (n % 3 === 1) bytes.set(latin1('fLaC'))
      if (n % 3 === 2) bytes.set(latin1('OggS'))
      expect(() => parseMediaInfo(bytes, 'mp3', '')).not.toThrow()
    }
  })
})
