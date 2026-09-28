/**
 * §5 v1.9 (aperçu) — fonctions pures de l'aperçu des fichiers : détection du type
 * d'aperçu (MIME + extension), base64 partiel, décodage de texte (UTF-8 / UTF-16 /
 * windows-1252), neutralisation, troncature, cache LRU, erreurs PDF, dimensions.
 */
import { describe, expect, it } from 'vitest'
import {
  LruCache,
  NODE_TEXT_LIMITS,
  PreviewTimeoutError,
  VIEWER_TEXT_LIMITS,
  base64DecodedLength,
  base64PrefixChars,
  buildTextPreview,
  clampPage,
  classifyPdfError,
  dataUrlPayload,
  decodeBase64,
  decodeTextBytes,
  decodeWindows1252,
  detectPreviewKind,
  displayImageMime,
  fileExtension,
  fileTypeLabel,
  fitScale,
  hasPdfSignature,
  initialFileNodeSize,
  sanitizePreviewText,
  stepZoom,
  nextFocusIndex,
  fileTransferPhase,
  transferPercent,
  truncateText
} from '@/lib/filePreview'
import { formatFileSize, formatPageCount } from '@/lib/fileFormat'
import { setLocale } from '@/i18n'

const b64 = (bytes: Uint8Array | number[]): string => Buffer.from(Uint8Array.from(bytes)).toString('base64')
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('detectPreviewKind', () => {
  it('reconnaît un PDF par son MIME ou son extension', () => {
    expect(detectPreviewKind('application/pdf', 'rapport.bin')).toBe('pdf')
    expect(detectPreviewKind('application/octet-stream', 'Rapport.PDF')).toBe('pdf')
    expect(detectPreviewKind('', 'scan.pdf')).toBe('pdf')
  })

  it('reconnaît les fichiers texte, y compris sans MIME ou avec un MIME bureautique', () => {
    expect(detectPreviewKind('text/plain', 'notes.txt')).toBe('text')
    expect(detectPreviewKind('text/plain;charset=utf-8', 'x')).toBe('text')
    expect(detectPreviewKind('', 'README.md')).toBe('text')
    expect(detectPreviewKind('application/octet-stream', 'journal.log')).toBe('text')
    // Un .csv sous Windows arrive souvent en application/vnd.ms-excel.
    expect(detectPreviewKind('application/vnd.ms-excel', 'export.csv')).toBe('text')
    expect(detectPreviewKind('application/json', 'data')).toBe('text')
    expect(detectPreviewKind('application/geo+json', 'zone')).toBe('text')
    expect(detectPreviewKind('', 'config.yml')).toBe('code') // §R2 v1.9 : YAML = code
    expect(detectPreviewKind('', 'table.tsv')).toBe('text')
  })

  it('traite le HTML comme du TEXTE (jamais rendu)', () => {
    expect(detectPreviewKind('text/html', 'page.html')).toBe('text')
    expect(detectPreviewKind('', 'page.htm')).toBe('text')
    expect(detectPreviewKind('application/xhtml+xml', 'page.xhtml')).toBe('text')
  })

  it('reconnaît les images affichables, pas les formats non décodables', () => {
    expect(detectPreviewKind('image/png', 'a.png')).toBe('image')
    expect(detectPreviewKind('image/svg+xml', 'a.svg')).toBe('image')
    expect(detectPreviewKind('', 'photo.JPG')).toBe('image')
    expect(detectPreviewKind('image/tiff', 'scan.tiff')).toBe('none')
    expect(detectPreviewKind('image/heic', 'photo.heic')).toBe('none')
  })

  it('retombe sur « none » pour les autres types', () => {
    expect(detectPreviewKind('application/zip', 'archive.zip')).toBe('none')
    expect(detectPreviewKind('application/octet-stream', 'binaire')).toBe('none')
    expect(detectPreviewKind('', '')).toBe('none')
    expect(detectPreviewKind('application/x-msdownload', 'setup.exe')).toBe('none')
  })
})

describe('fileExtension / fileTypeLabel / displayImageMime', () => {
  it('extrait l’extension en minuscules', () => {
    expect(fileExtension('Rapport Final.PDF')).toBe('pdf')
    expect(fileExtension('archive.tar.gz')).toBe('gz')
    expect(fileExtension('.bashrc')).toBe('')
    expect(fileExtension('sans-extension')).toBe('')
    expect(fileExtension('dossier/fichier.txt')).toBe('txt')
    expect(fileExtension('fin.')).toBe('')
  })

  it('donne un libellé court', () => {
    expect(fileTypeLabel('application/pdf', 'x.pdf')).toBe('PDF')
    expect(fileTypeLabel('application/pdf', 'sans-ext')).toBe('PDF')
    expect(fileTypeLabel('application/octet-stream', 'sans-ext')).toBe('')
    expect(fileTypeLabel('text/csv', 'donnees.csv')).toBe('CSV')
  })

  it('corrige le MIME d’affichage d’une image d’après l’extension', () => {
    expect(displayImageMime('image/png', 'a.png')).toBe('image/png')
    expect(displayImageMime('application/octet-stream', 'logo.svg')).toBe('image/svg+xml')
    expect(displayImageMime('image/tiff', 'a.tif')).toBeNull()
    expect(displayImageMime('application/zip', 'a.zip')).toBeNull()
  })
})

describe('base64', () => {
  it('calcule la taille décodée (padding compris)', () => {
    expect(base64DecodedLength('')).toBe(0)
    expect(base64DecodedLength(b64([1]))).toBe(1)
    expect(base64DecodedLength(b64([1, 2]))).toBe(2)
    expect(base64DecodedLength(b64([1, 2, 3]))).toBe(3)
    expect(base64PrefixChars(4)).toBe(8)
    expect(base64PrefixChars(3)).toBe(4)
  })

  it('décode en entier ou seulement un préfixe', () => {
    const bytes = Array.from({ length: 1000 }, (_, i) => i % 256)
    const payload = b64(bytes)
    expect(Array.from(decodeBase64(payload))).toEqual(bytes)
    const prefix = decodeBase64(payload, 10)
    expect(prefix.length).toBe(10)
    expect(Array.from(prefix)).toEqual(bytes.slice(0, 10))
  })

  it('décode une grosse charge par tranches', () => {
    const bytes = new Uint8Array(600_000).map((_, i) => (i * 7) % 256)
    const out = decodeBase64(b64(bytes))
    expect(out.length).toBe(bytes.length)
    expect(out[599_999]).toBe(bytes[599_999])
  })

  it('lève une erreur sur une charge corrompue', () => {
    expect(() => decodeBase64('@@@@')).toThrow()
  })

  it('extrait la charge d’une data-URL base64', () => {
    expect(dataUrlPayload('data:text/plain;base64,QUJD')).toBe('QUJD')
    expect(dataUrlPayload('data:text/plain,ABC')).toBe('')
    expect(dataUrlPayload('https://exemple.invalid/x')).toBe('')
  })
})

describe('decodeTextBytes', () => {
  it('décode l’UTF-8 (accents compris)', () => {
    const result = decodeTextBytes(utf8('Élément — café'))
    expect(result).toEqual({ text: 'Élément — café', encoding: 'UTF-8', binary: false })
  })

  it('retombe sur windows-1252 si l’UTF-8 est invalide', () => {
    // « Été 2024 € » en windows-1252.
    const bytes = new Uint8Array([0xc9, 0x74, 0xe9, 0x20, 0x32, 0x30, 0x32, 0x34, 0x20, 0x80])
    const result = decodeTextBytes(bytes)
    expect(result.encoding).toBe('windows-1252')
    expect(result.text).toBe('Été 2024 €')
  })

  it('décode windows-1252 à la main (guillemets, €, gros volumes)', () => {
    expect(decodeWindows1252(new Uint8Array([0x93, 0x61, 0x94, 0x20, 0x80, 0x9c, 0xe0]))).toBe('“a” €œà')
    const big = new Uint8Array(20_000).fill(0xe9)
    expect(decodeWindows1252(big)).toBe('é'.repeat(20_000))
  })

  it('suit le BOM UTF-8 / UTF-16 LE / UTF-16 BE', () => {
    const bom8 = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('abc')])
    expect(decodeTextBytes(bom8)).toMatchObject({ text: 'abc', encoding: 'UTF-8' })
    const le = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0xe9, 0x00])
    expect(decodeTextBytes(le)).toMatchObject({ text: 'aé', encoding: 'UTF-16LE' })
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x61, 0x00, 0xe9])
    expect(decodeTextBytes(be)).toMatchObject({ text: 'aé', encoding: 'UTF-16BE' })
  })

  it('ne confond pas une séquence UTF-8 coupée en fin de préfixe avec du windows-1252', () => {
    const full = utf8('abc é')
    const cut = full.subarray(0, full.length - 1) // coupe au milieu de « é »
    expect(decodeTextBytes(cut, true)).toMatchObject({ text: 'abc ', encoding: 'UTF-8' })
  })

  it('repère un contenu binaire', () => {
    expect(decodeTextBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])).binary).toBe(true)
  })
})

describe('sanitizePreviewText / truncateText', () => {
  it('normalise les fins de ligne et neutralise les caractères de contrôle et bidi', () => {
    expect(sanitizePreviewText('a\r\nb\rc')).toBe('a\nb\nc')
    expect(sanitizePreviewText('x\u0000y\u001bz\tw')).toBe('x\uFFFDy\uFFFDz\tw')
    expect(sanitizePreviewText('abc\u202edef')).toBe('abc\uFFFDdef')
    expect(sanitizePreviewText('a\u0081b')).toBe('a\uFFFDb')
    // Le HTML reste du texte (aucune transformation).
    expect(sanitizePreviewText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it('tronque par lignes et par caractères', () => {
    expect(truncateText('1\n2\n3\n4', 100, 2)).toEqual({ text: '1\n2', truncated: true })
    expect(truncateText('abcdef', 3, 10)).toEqual({ text: 'abc', truncated: true })
    expect(truncateText('court', 100, 10)).toEqual({ text: 'court', truncated: false })
    expect(truncateText('a\nb', 100, 2)).toEqual({ text: 'a\nb', truncated: false })
  })

  it('ne coupe pas une paire de substitution', () => {
    const result = truncateText('ab😀c', 3, 10)
    expect(result.text).toBe('ab')
  })
})

describe('buildTextPreview', () => {
  it('construit l’extrait d’un nœud (lignes bornées, drapeau de troncature)', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `ligne ${i + 1};valeur é`).join('\n')
    const preview = buildTextPreview(b64(utf8(lines)), NODE_TEXT_LIMITS)
    expect(preview.binary).toBe(false)
    expect(preview.encoding).toBe('UTF-8')
    expect(preview.truncated).toBe(true)
    expect(preview.text.split('\n').length).toBe(NODE_TEXT_LIMITS.lines)
    expect(preview.text.startsWith('ligne 1;valeur é')).toBe(true)
  })

  it('ne décode que le préfixe utile d’un gros fichier', () => {
    const big = 'x'.repeat(NODE_TEXT_LIMITS.bytes * 4)
    const preview = buildTextPreview(b64(utf8(big)), NODE_TEXT_LIMITS)
    expect(preview.truncated).toBe(true)
    expect(preview.text.length).toBeLessThanOrEqual(NODE_TEXT_LIMITS.chars)
  })

  it('borne le texte de la visionneuse', () => {
    const preview = buildTextPreview(b64(utf8('abc\n'.repeat(10))), VIEWER_TEXT_LIMITS)
    expect(preview.truncated).toBe(false)
    expect(preview.text).toBe('abc\n'.repeat(10))
  })

  it('signale un binaire', () => {
    expect(buildTextPreview(b64([0, 1, 2, 3]), NODE_TEXT_LIMITS).binary).toBe(true)
  })
})

describe('LruCache', () => {
  it('évince l’entrée la moins récemment utilisée', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1) // « a » devient la plus récente
    cache.set('c', 3)
    expect(cache.has('b')).toBe(false)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
    expect(cache.size).toBe(2)
  })

  it('met à jour une clé existante sans dépasser la capacité', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('a', 2)
    expect(cache.size).toBe(1)
    expect(cache.get('a')).toBe(2)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
  })
})

describe('PDF', () => {
  it('classe les erreurs pdf.js', () => {
    const named = (name: string): Error => Object.assign(new Error(name), { name })
    expect(classifyPdfError(named('PasswordException'))).toBe('encrypted')
    expect(classifyPdfError(named('InvalidPDFException'))).toBe('corrupt')
    expect(classifyPdfError(named('FormatError'))).toBe('corrupt')
    expect(classifyPdfError(new PreviewTimeoutError())).toBe('timeout')
    expect(classifyPdfError(new Error('pdf-worker-error'))).toBe('unavailable')
    expect(classifyPdfError('bizarre')).toBe('unavailable')
  })

  it('vérifie la signature %PDF-', () => {
    expect(hasPdfSignature(utf8('%PDF-1.7\n...'))).toBe(true)
    expect(hasPdfSignature(utf8('\n\n%PDF-1.4'))).toBe(true)
    expect(hasPdfSignature(utf8('<html>'))).toBe(false)
    expect(hasPdfSignature(new Uint8Array())).toBe(false)
  })

  it('borne l’échelle de rendu (côtés et pixels)', () => {
    // A4 (595 × 842 pt) dans 640 × 900 → limité par la largeur.
    const scale = fitScale(595, 842, 640, 900, 640 * 900)
    expect(595 * scale).toBeLessThanOrEqual(640.0001)
    expect(842 * scale).toBeLessThanOrEqual(900.0001)
    // Page géante : bornée par le nombre de pixels.
    const huge = fitScale(14400, 14400, 8192, 8192, 16_777_216)
    expect(14400 * huge * 14400 * huge).toBeLessThanOrEqual(16_777_216 + 1)
    // Dimensions invalides : échelle neutre.
    expect(fitScale(0, 100, 10, 10, 100)).toBe(1)
    expect(fitScale(Number.NaN, 100, 10, 10, 100)).toBe(1)
  })

  it('navigue et zoome dans des bornes', () => {
    expect(clampPage(0, 5)).toBe(1)
    expect(clampPage(9, 5)).toBe(5)
    expect(clampPage(3.4, 5)).toBe(3)
    expect(clampPage(Number.NaN, 5)).toBe(1)
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(0.83, 1)).toBe(1)
    expect(stepZoom(0.83, -1)).toBe(0.75)
    expect(stepZoom(4, 1)).toBe(4)
    expect(stepZoom(0.25, -1)).toBe(0.25)
    expect(stepZoom(0.1, -1)).toBe(0.1)
    expect(stepZoom(0.1, 1)).toBe(0.25)
    expect(stepZoom(5, 1)).toBe(5)
  })
})

describe('initialFileNodeSize', () => {
  it('donne une taille adaptée à l’aperçu', () => {
    expect(initialFileNodeSize('pdf').height).toBeGreaterThan(initialFileNodeSize('none').height)
    expect(initialFileNodeSize('none')).toEqual({ width: 260, height: 96 })
    expect(initialFileNodeSize('text').width).toBeGreaterThanOrEqual(300)
  })
})

describe('fileTransferPhase / transferPercent', () => {
  it('distingue fichier inconnu, transfert en cours, bloqué et corrompu', () => {
    // Métadonnées absentes : « en attente » puis « indisponible », jamais « corrompu ».
    expect(fileTransferPhase('missing', false)).toBe('missing')
    expect(fileTransferPhase('missing', true)).toBe('missing')
    expect(fileTransferPhase('loading', false)).toBe('loading')
    // Transfert commencé mais bloqué : erreur (avec réessai).
    expect(fileTransferPhase('loading', true)).toBe('error')
    expect(fileTransferPhase('error', false)).toBe('error')
  })

  it('borne la progression', () => {
    expect(transferPercent(0, 0)).toBe(0)
    expect(transferPercent(1, 3)).toBe(33)
    expect(transferPercent(3, 3)).toBe(100)
    expect(transferPercent(9, 3)).toBe(100)
    expect(transferPercent(-1, 3)).toBe(0)
    expect(transferPercent(Number.NaN, 3)).toBe(0)
  })
})

describe('fileFormat (libellés localisés)', () => {
  // Espaces insécables (séparateurs de milliers, fr) normalisés pour la comparaison.
  const plain = (value: string): string => value.replace(/[\u00a0\u202f]/g, ' ')

  it('formate la taille dans les unités de chaque langue', () => {
    setLocale('fr')
    expect(plain(formatFileSize(512))).toBe('512 o')
    expect(plain(formatFileSize(2048))).toBe('2 Ko')
    expect(plain(formatFileSize(1.5 * 1024 * 1024))).toBe('1,5 Mo')
    expect(plain(formatFileSize(-4))).toBe('0 o')
    setLocale('en')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatFileSize(2048)).toBe('2 KB')
    setLocale('pl')
    expect(plain(formatFileSize(1.5 * 1024 * 1024))).toBe('1,5 MB')
    setLocale('fr')
  })

  it('accorde le nombre de pages (pluriels polonais compris)', () => {
    setLocale('fr')
    expect(formatPageCount(1)).toBe('1 page')
    expect(formatPageCount(2)).toBe('2 pages')
    setLocale('en')
    expect(formatPageCount(1)).toBe('1 page')
    expect(formatPageCount(12)).toBe('12 pages')
    setLocale('pl')
    expect(formatPageCount(1)).toBe('1 strona')
    expect(formatPageCount(2)).toBe('2 strony')
    expect(formatPageCount(5)).toBe('5 stron')
    expect(formatPageCount(22)).toBe('22 strony')
    expect(formatPageCount(12)).toBe('12 stron')
    setLocale('fr')
  })
})

describe('nextFocusIndex (piège à focus de la visionneuse)', () => {
  it('cycle vers l\'avant et boucle', () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1)
    expect(nextFocusIndex(3, 2, false)).toBe(0)
  })
  it('cycle vers l\'arrière et boucle', () => {
    expect(nextFocusIndex(3, 0, true)).toBe(2)
    expect(nextFocusIndex(3, 2, true)).toBe(1)
  })
  it('focus hors liste : premier ou dernier', () => {
    expect(nextFocusIndex(4, -1, false)).toBe(0)
    expect(nextFocusIndex(4, -1, true)).toBe(3)
    expect(nextFocusIndex(4, 9, false)).toBe(0)
  })
  it('rien de focalisable', () => {
    expect(nextFocusIndex(0, -1, false)).toBe(-1)
    expect(nextFocusIndex(0, 0, true)).toBe(-1)
  })
})

describe('extensions héritées du prototype (§D6 v1.9)', () => {
  it("ne classe pas 'constructor' / '__proto__' / 'toString' comme image", () => {
    for (const ext of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(detectPreviewKind('application/octet-stream', `x.${ext}`)).toBe('none')
      expect(displayImageMime('', `x.${ext}`)).toBeNull()
    }
  })
})

describe('previewCacheKey — contenu inline (§D2 v1.9)', () => {
  it('garde le hash tel quel et dérive une clé courte et stable pour l’inline', async () => {
    const { previewCacheKey } = await import('@/components/nodes/fileSource')
    expect(previewCacheKey('abc123', 'data:x')).toBe('abc123')
    expect(previewCacheKey(null, null)).toBeNull()
    const big = 'data:application/pdf;base64,' + 'QUJD'.repeat(200_000)
    const k = previewCacheKey(null, big)
    expect(k).not.toBeNull()
    expect(k!.length).toBeLessThan(64)
    expect(previewCacheKey(null, big.slice(0))).toBe(k)
    expect(previewCacheKey(null, big.slice(0, -4) + 'QUJE')).not.toBe(k)
  })
})
