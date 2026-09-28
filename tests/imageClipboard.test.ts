/**
 * §1 v1.9 (copie d'image) — logique PURE de la sortie d'image du tableau :
 *  - validation des data-URL reçues par le main (type, base64, taille, signature) ;
 *  - nom de fichier sûr pour le glisser-déposer / « Enregistrer sous » ;
 *  - reconnaissance du raccourci presse-papiers (Ctrl/Cmd+C, Ctrl+X, Ctrl+Inser) ;
 *  - comparaison d'empreintes (recollage fidèle de NOTRE image dans COSINT).
 */
import { describe, expect, it } from 'vitest'
import {
  classifyReadback,
  type ImageProbe,
  MAX_IMAGE_DATA_URL_LENGTH,
  meanChannelDistance,
  parseImageDataUrl,
  safeImageFileName,
  sniffImageMime,
  type ReadbackVerdict,
  VERIFY_TOLERANCE,
  writeVerified
} from '@shared/imageData'
import {
  clipboardChordOf,
  fingerprintsMatch,
  FINGERPRINT_SIDE,
  imageCopyTarget,
  imageFileName,
  imageKeyAction,
  type ImageFingerprint
} from '@/lib/imageClipboard'
import { setLocale } from '@/i18n'

/** PNG 1×1 réel (signature + IHDR…), en base64. */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
/** Début d'un JPEG (SOI + APP0). */
const JPEG_HEAD = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA=='
/** En-tête RIFF….WEBP. */
const WEBP_HEAD = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA='

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)
const char = (code: number): string => String.fromCharCode(code)

describe('parseImageDataUrl', () => {
  it('accepte un PNG base64 canonique', () => {
    const parsed = parseImageDataUrl(`data:image/png;base64,${PNG_1PX}`)
    expect(parsed).toEqual({ mime: 'image/png', base64: PNG_1PX })
  })

  it('normalise image/jpg en image/jpeg (et la casse)', () => {
    expect(parseImageDataUrl(`data:IMAGE/JPG;base64,${JPEG_HEAD}`)?.mime).toBe('image/jpeg')
  })

  it('refuse le WebP par défaut (nativeImage ne le décode pas) mais l’accepte sur demande', () => {
    const url = `data:image/webp;base64,${WEBP_HEAD}`
    expect(parseImageDataUrl(url)).toBeNull()
    expect(parseImageDataUrl(url, ['image/webp'])?.mime).toBe('image/webp')
  })

  it('refuse tout ce qui n’est pas une data-URL image base64 valide', () => {
    expect(parseImageDataUrl(42)).toBeNull()
    expect(parseImageDataUrl(null)).toBeNull()
    expect(parseImageDataUrl('https://exemple.invalid/a.png')).toBeNull()
    expect(parseImageDataUrl(`data:text/html;base64,${PNG_1PX}`)).toBeNull()
    expect(parseImageDataUrl(`data:image/png,${PNG_1PX}`)).toBeNull() // pas base64
    expect(parseImageDataUrl('data:image/png;base64,')).toBeNull() // vide
    expect(parseImageDataUrl('data:image/png;base64,abc')).toBeNull() // longueur % 4
    expect(parseImageDataUrl('data:image/png;base64,ab$d')).toBeNull() // alphabet
    expect(parseImageDataUrl('data:image/png;base64,ab d')).toBeNull() // espace
    expect(parseImageDataUrl('data:image/png;base64,a===')).toBeNull() // bourrage excessif
  })

  it('refuse une data-URL plus longue que la limite', () => {
    const url = `data:image/png;base64,${PNG_1PX}`
    expect(parseImageDataUrl(url, ['image/png'], url.length)).not.toBeNull()
    expect(parseImageDataUrl(url, ['image/png'], url.length - 1)).toBeNull()
    expect(MAX_IMAGE_DATA_URL_LENGTH).toBeGreaterThan(16 * 1024 * 1024)
  })
})

describe('sniffImageMime', () => {
  it('reconnaît les signatures binaires', () => {
    expect(sniffImageMime(Uint8Array.from(Buffer.from(PNG_1PX, 'base64')))).toBe('image/png')
    expect(sniffImageMime(Uint8Array.from(Buffer.from(JPEG_HEAD, 'base64')))).toBe('image/jpeg')
    expect(sniffImageMime(Uint8Array.from(Buffer.from(WEBP_HEAD, 'base64')))).toBe('image/webp')
    expect(sniffImageMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif')
    expect(sniffImageMime(bytes(0x42, 0x4d, 0, 0))).toBe('image/bmp')
  })

  it('retourne null pour des octets inconnus ou tronqués', () => {
    expect(sniffImageMime(bytes())).toBeNull()
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e))).toBeNull() // PNG tronqué
    expect(sniffImageMime(Uint8Array.from(Buffer.from('<svg xmlns="x"/>')))).toBeNull()
    expect(sniffImageMime(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull() // exécutable « MZ »
  })
})

describe('safeImageFileName', () => {
  it('garde un titre lisible et ajoute .png', () => {
    expect(safeImageFileName('Capture du profil')).toBe('Capture du profil.png')
  })

  it('ne laisse sortir aucun chemin (séparateurs / traversée)', () => {
    const name = safeImageFileName('../../Windows/System32/evil')
    expect(name).not.toMatch(/[\\/]/)
    expect(name.endsWith('.png')).toBe(true)
    expect(safeImageFileName('C:\\Users\\x\\a.png')).not.toMatch(/[\\/:]/)
  })

  it('retire les caractères interdits, de contrôle et bidirectionnels', () => {
    const name = safeImageFileName(`photo${char(0x202e)}gpj.exe${char(0)}*?"<>|`)
    expect(name).not.toContain(char(0x202e))
    expect(name).not.toContain(char(0))
    expect(name).not.toMatch(/[*?"<>|]/)
    expect(name.endsWith('.png')).toBe(true)
  })

  it('remplace une extension image existante et retire points/espaces finaux', () => {
    expect(safeImageFileName('photo.jpg')).toBe('photo.png')
    expect(safeImageFileName('photo.WEBP')).toBe('photo.png')
    expect(safeImageFileName('note...  ')).toBe('note.png')
  })

  it('préfixe les noms réservés de Windows', () => {
    expect(safeImageFileName('CON')).toBe('image-CON.png')
    // §x v1.9 : « NOM.quelque-chose » désigne encore le périphérique sous Windows.
    expect(safeImageFileName('con.1')).toBe('image-con.1.png')
    expect(safeImageFileName('NUL.tar.gz')).toBe('image-NUL.tar.gz.png')
    expect(safeImageFileName('COM1.png.png')).toBe('image-COM1.png.png')
    expect(safeImageFileName('LPT\u00b9')).toBe('image-LPT\u00b9.png')
    expect(safeImageFileName('console.png')).toBe('console.png')
    expect(safeImageFileName('lpt1', 'obraz')).toBe('obraz-lpt1.png')
  })

  it('retombe sur le nom de repli (titre vide, non-chaîne, que des caractères interdits)', () => {
    expect(safeImageFileName('')).toBe('image.png')
    expect(safeImageFileName(undefined, 'obraz')).toBe('obraz.png')
    expect(safeImageFileName('///', 'image')).toBe('image.png')
    expect(safeImageFileName('   ', '')).toBe('image.png')
  })

  it('borne la longueur', () => {
    expect(safeImageFileName('x'.repeat(500)).length).toBeLessThanOrEqual(84)
  })

  it('imageFileName utilise le repli traduit', () => {
    setLocale('pl')
    expect(imageFileName('')).toBe('obraz.png')
    setLocale('fr')
    expect(imageFileName('')).toBe('image.png')
    expect(imageFileName('Carte / plan')).toBe('Carte plan.png')
  })
})

describe('clipboardChordOf', () => {
  const key = (
    k: string,
    mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
    code?: string
  ) => ({ key: k, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

  it('Ctrl+C (Windows/Linux) et Cmd+C (macOS) → copy', () => {
    expect(clipboardChordOf(key('c', { ctrlKey: true }, 'KeyC'))).toBe('copy')
    expect(clipboardChordOf(key('C', { ctrlKey: true }, 'KeyC'))).toBe('copy') // verr. maj.
    expect(clipboardChordOf(key('c', { metaKey: true }, 'KeyC'))).toBe('copy')
  })

  it('Ctrl+X → cut ; Ctrl+Inser → copy', () => {
    expect(clipboardChordOf(key('x', { ctrlKey: true }, 'KeyX'))).toBe('cut')
    expect(clipboardChordOf(key('Insert', { ctrlKey: true }, 'Insert'))).toBe('copy')
  })

  it('suit la LETTRE produite (AZERTY/QWERTZ/Dvorak), la touche physique en repli non latin', () => {
    // Dvorak : la lettre « c » est sur la touche physique KeyI.
    expect(clipboardChordOf(key('c', { ctrlKey: true }, 'KeyI'))).toBe('copy')
    // Dvorak : la touche physique KeyC produit « j » → pas une copie.
    expect(clipboardChordOf(key('j', { ctrlKey: true }, 'KeyC'))).toBeNull()
    // Disposition cyrillique : « с » sur la touche physique KeyC → copie.
    expect(clipboardChordOf(key(char(0x0441), { ctrlKey: true }, 'KeyC'))).toBe('copy')
  })

  it('ignore les autres combinaisons (Maj, Alt/AltGr, sans modificateur, autres lettres)', () => {
    expect(clipboardChordOf(key('c'))).toBeNull()
    expect(clipboardChordOf(key('C', { ctrlKey: true, shiftKey: true }, 'KeyC'))).toBeNull()
    expect(clipboardChordOf(key('c', { ctrlKey: true, altKey: true }, 'KeyC'))).toBeNull() // AltGr
    expect(clipboardChordOf(key('v', { ctrlKey: true }, 'KeyV'))).toBeNull()
    expect(clipboardChordOf(key('Insert', { metaKey: true }, 'Insert'))).toBeNull()
    expect(clipboardChordOf(key('Control', { ctrlKey: true }, 'ControlLeft'))).toBeNull()
  })
})

describe('fingerprintsMatch', () => {
  const size = FINGERPRINT_SIDE * FINGERPRINT_SIDE * 4
  const print = (width: number, height: number, fill: (index: number) => number): ImageFingerprint => ({
    width,
    height,
    samples: Array.from({ length: size }, (_, index) => fill(index))
  })
  const gradient = (index: number): number => (index * 7) % 256

  it('même image → correspondance', () => {
    expect(fingerprintsMatch(print(800, 600, gradient), print(800, 600, gradient))).toBe(true)
  })

  it('tolère les arrondis d’un aller-retour par le presse-papiers', () => {
    const noisy = print(800, 600, (index) => Math.max(0, Math.min(255, gradient(index) + ((index % 5) - 2))))
    expect(fingerprintsMatch(print(800, 600, gradient), noisy)).toBe(true)
  })

  it('image différente de mêmes dimensions → pas de correspondance', () => {
    const other = print(800, 600, (index) => 255 - gradient(index))
    expect(fingerprintsMatch(print(800, 600, gradient), other)).toBe(false)
  })

  it('dimensions différentes → jamais de correspondance', () => {
    expect(fingerprintsMatch(print(800, 600, gradient), print(801, 600, gradient))).toBe(false)
    expect(fingerprintsMatch(print(800, 600, gradient), print(600, 800, gradient))).toBe(false)
  })

  it('image à transparence recollée depuis Windows (alpha rendu opaque) → correspondance', () => {
    // Copie : RGBA non prémultiplié, alpha variable (0 = transparent, 128 = semi).
    const alphaOf = (pixel: number): number => [0, 128, 255, 64][pixel % 4]
    const copied = print(64, 64, (index) => (index % 4 === 3 ? alphaOf(index >> 2) : 200 - (index % 4) * 40))
    // Recollage : couleurs prémultipliées conservées, alpha forcé à 255.
    const pasted = print(64, 64, (index) =>
      index % 4 === 3 ? 255 : Math.round(((200 - (index % 4) * 40) * alphaOf(index >> 2)) / 255)
    )
    expect(fingerprintsMatch(copied, pasted)).toBe(true)
    // Même dimensions, couleurs différentes : toujours distinguées.
    const other = print(64, 64, (index) => (index % 4 === 3 ? 255 : 30))
    expect(fingerprintsMatch(copied, other)).toBe(false)
  })

  it('empreintes vides ou de tailles différentes → pas de correspondance', () => {
    const empty: ImageFingerprint = { width: 1, height: 1, samples: [] }
    expect(fingerprintsMatch(empty, empty)).toBe(false)
    expect(fingerprintsMatch(print(10, 10, gradient), { width: 10, height: 10, samples: [1, 2, 3, 4] })).toBe(false)
  })
})

describe('meanChannelDistance (vérification par relecture du presse-papiers)', () => {
  it('0 pour deux échantillons identiques, petite valeur pour des arrondis', () => {
    const a = [10, 20, 30, 255, 0, 0, 0, 0]
    expect(meanChannelDistance(a, a)).toBe(0)
    expect(meanChannelDistance(a, [11, 19, 31, 254, 0, 0, 0, 0])).toBeLessThanOrEqual(VERIFY_TOLERANCE)
  })

  it('grande valeur pour une autre image (même taille) → la relecture échoue', () => {
    const a = Array.from({ length: 1024 }, (_, i) => (i * 7) % 256)
    const b = a.map((v) => 255 - v)
    expect(meanChannelDistance(a, b)).toBeGreaterThan(VERIFY_TOLERANCE)
  })

  it('Infinity si longueurs différentes ou nulles (jamais un faux succès)', () => {
    expect(meanChannelDistance([], [])).toBe(Infinity)
    expect(meanChannelDistance([1, 2, 3, 4], [1, 2, 3])).toBe(Infinity)
  })
})

describe('imageCopyTarget (la sélection est-elle UNE image à poser en bitmap ?)', () => {
  const WEBP = 'data:image/webp;base64,UklGRg=='
  const files: Record<string, string> = { h1: WEBP, pdf: 'data:application/pdf;base64,JVBERg==' }
  const resolve = (hash: string): string | null => files[hash] ?? null
  const image = (content: string) => ({ kind: 'image', content })

  it('une image complète → bitmap (data-URL résolue)', () => {
    expect(imageCopyTarget([image('h1')], resolve)).toEqual({ kind: 'image', dataUrl: WEBP })
  })

  it('data-URL inline héritée (avant v1.4) → prise telle quelle', () => {
    const inline = 'data:image/png;base64,iVBORw=='
    expect(imageCopyTarget([image(inline)], resolve)).toEqual({ kind: 'image', dataUrl: inline })
  })

  it('image encore en réception (chunks manquants) → pending', () => {
    expect(imageCopyTarget([image('absent')], resolve)).toEqual({ kind: 'pending' })
  })

  it('image manquante ou corrompue (définitif) → null : la copie du fragment COSINT s’applique', () => {
    expect(imageCopyTarget([image('broken')], () => false)).toBeNull()
  })

  it('sélection multiple, nœud non image, image vide → null (fragment COSINT)', () => {
    expect(imageCopyTarget([image('h1'), image('h1')], resolve)).toBeNull()
    expect(imageCopyTarget([{ kind: 'entity', content: '' }], resolve)).toBeNull()
    expect(imageCopyTarget([{ kind: 'text', content: 'h1' }], resolve)).toBeNull()
    expect(imageCopyTarget([image('')], resolve)).toBeNull()
    expect(imageCopyTarget([], resolve)).toBeNull()
  })

  it('octets résolus qui ne sont pas une image (pair incohérent) → jamais posés en bitmap', () => {
    expect(imageCopyTarget([image('pdf')], resolve)).toBeNull()
  })
})

describe('imageKeyAction (interception du raccourci au keydown)', () => {
  const ready = { kind: 'image' as const, dataUrl: 'data:image/webp;base64,UklGRg==' }

  it('Ctrl+C / Ctrl+X sur une image complète → copy / cut avec la data-URL', () => {
    expect(imageKeyAction('copy', false, ready)).toEqual({ action: 'copy', dataUrl: ready.dataUrl })
    expect(imageKeyAction('cut', false, ready)).toEqual({ action: 'cut', dataUrl: ready.dataUrl })
  })

  it('image en réception → pending (toast, rien de copié)', () => {
    expect(imageKeyAction('copy', false, { kind: 'pending' })).toEqual({ action: 'pending' })
    expect(imageKeyAction('cut', false, { kind: 'pending' })).toEqual({ action: 'pending' })
  })

  it('jamais d’interception dans un champ de saisie, sans raccourci, ou hors image', () => {
    expect(imageKeyAction('copy', true, ready)).toBeNull()
    expect(imageKeyAction('copy', true, { kind: 'pending' })).toBeNull()
    expect(imageKeyAction(null, false, ready)).toBeNull()
    expect(imageKeyAction('copy', false, null)).toBeNull()
  })
})

describe('classifyReadback (verdict de la relecture après écriture)', () => {
  const sample = Array.from({ length: 64 }, (_, i) => (i * 13) % 256)
  const expected: ImageProbe = { width: 40, height: 30, sample }

  it('rien de lisible mais une image annoncée → unreadable (relire, ne pas réécrire)', () => {
    expect(classifyReadback(expected, null, true)).toBe('unreadable')
  })

  it('rien de lisible et aucun format image → foreign (écriture perdue)', () => {
    expect(classifyReadback(expected, null, false)).toBe('foreign')
  })

  it('dimensions différentes → foreign, même avec les mêmes pixels', () => {
    expect(classifyReadback(expected, { width: 41, height: 30, sample }, true)).toBe('foreign')
    expect(classifyReadback(expected, { width: 40, height: 29, sample }, true)).toBe('foreign')
  })

  it('mêmes dimensions, couleurs dans la tolérance → ours (alpha ignoré)', () => {
    const rounded = sample.map((v, i) => (i % 4 === 3 ? 255 : Math.min(255, v + VERIFY_TOLERANCE)))
    expect(classifyReadback(expected, { width: 40, height: 30, sample: rounded }, true)).toBe('ours')
  })

  it('mêmes dimensions, couleurs au-delà de la tolérance → foreign (ancienne image restée)', () => {
    const other = sample.map((v) => 255 - v)
    expect(classifyReadback(expected, { width: 40, height: 30, sample: other }, true)).toBe('foreign')
    const drift = sample.map((v, i) => (i % 4 === 3 ? v : v <= 127 ? v + VERIFY_TOLERANCE + 1 : v - VERIFY_TOLERANCE - 1))
    expect(classifyReadback(expected, { width: 40, height: 30, sample: drift }, true)).toBe('foreign')
  })

  it('tolérance explicite respectée', () => {
    const shifted = sample.map((v, i) => (i % 4 === 3 ? v : v <= 127 ? v + 10 : v - 10))
    const current = { width: 40, height: 30, sample: shifted }
    expect(classifyReadback(expected, current, true, 10)).toBe('ours')
    expect(classifyReadback(expected, current, true, 9)).toBe('foreign')
  })
})

describe('writeVerified (écriture vérifiée, reprises bornées)', () => {
  /** Étapes simulées : `verdicts` est consommé à chaque relecture ; `writeFails` lève aux écritures indiquées (1-based). */
  function makeSteps(verdicts: Array<ReadbackVerdict | 'throw'>, writeFails: number[] = []) {
    const log: string[] = []
    const sleeps: number[] = []
    let writeCount = 0
    return {
      log,
      sleeps,
      steps: {
        write: () => {
          writeCount++
          log.push('write')
          if (writeFails.includes(writeCount)) throw new Error('clipboard locked')
        },
        check: (): ReadbackVerdict => {
          log.push('check')
          const next = verdicts.shift() ?? 'foreign'
          if (next === 'throw') throw new Error('read locked')
          return next
        },
        sleep: async (ms: number) => {
          sleeps.push(ms)
        }
      }
    }
  }

  it('cas normal : UNE écriture + UNE relecture, aucune attente', async () => {
    const { steps, log, sleeps } = makeSteps(['ours'])
    expect(await writeVerified(steps)).toEqual({ ok: true, writes: 1, checks: 1 })
    expect(log).toEqual(['write', 'check'])
    expect(sleeps).toEqual([])
  })

  it('foreign → réécriture après le délai suivant, puis succès', async () => {
    const { steps, log, sleeps } = makeSteps(['foreign', 'ours'])
    expect(await writeVerified(steps, [0, 60, 200], [0, 25])).toEqual({ ok: true, writes: 2, checks: 2 })
    expect(log).toEqual(['write', 'check', 'write', 'check'])
    expect(sleeps).toEqual([60])
  })

  it('unreadable → relecture SANS réécriture, puis succès', async () => {
    const { steps, log, sleeps } = makeSteps(['unreadable', 'unreadable', 'ours'])
    expect(await writeVerified(steps, [0, 60], [0, 25, 60])).toEqual({ ok: true, writes: 1, checks: 3 })
    expect(log).toEqual(['write', 'check', 'check', 'check'])
    expect(sleeps).toEqual([25, 60])
  })

  it('unreadable jusqu’au bout des relectures → réécriture', async () => {
    const { steps, log } = makeSteps(['unreadable', 'unreadable', 'ours'])
    expect(await writeVerified(steps, [0, 60], [0, 25])).toEqual({ ok: true, writes: 2, checks: 3 })
    expect(log).toEqual(['write', 'check', 'check', 'write', 'check'])
  })

  it('une relecture qui lève compte comme unreadable', async () => {
    const { steps, log } = makeSteps(['throw', 'ours'])
    expect(await writeVerified(steps, [0], [0, 25])).toEqual({ ok: true, writes: 1, checks: 2 })
    expect(log).toEqual(['write', 'check', 'check'])
  })

  it('une écriture qui lève → pas de relecture, écriture suivante', async () => {
    const { steps, log } = makeSteps(['ours'], [1])
    expect(await writeVerified(steps, [0, 60], [0])).toEqual({ ok: true, writes: 2, checks: 1 })
    expect(log).toEqual(['write', 'write', 'check'])
  })

  it('toujours foreign → échec, écritures bornées au nombre de délais', async () => {
    const { steps } = makeSteps(Array(50).fill('foreign'))
    const result = await writeVerified(steps, [0, 60, 200], [0, 25, 60, 120])
    expect(result).toEqual({ ok: false, writes: 3, checks: 3 })
  })

  it('toujours unreadable / écritures qui lèvent → échec borné (jamais de boucle infinie)', async () => {
    const stuck = makeSteps(Array(50).fill('unreadable'))
    expect(await writeVerified(stuck.steps, [0, 60], [0, 25, 60])).toEqual({ ok: false, writes: 2, checks: 6 })
    const broken = makeSteps([], [1, 2, 3])
    expect(await writeVerified(broken.steps)).toEqual({ ok: false, writes: 3, checks: 0 })
  })
})
