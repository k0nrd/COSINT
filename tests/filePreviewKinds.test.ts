/**
 * §R2 v1.9 — détection des nouveaux types d'aperçu : bureautique, audio, vidéo, code.
 */
import { describe, expect, it } from 'vitest'
import {
  FILE_GRID_CELL,
  detectPreviewKind,
  fileGridPosition,
  isExecutableScript,
  previewExtension
} from '@/lib/filePreview'

const OFFICE = 'docx docm dotx dotm xlsx xlsm xltx xltm pptx pptm potx potm ppsx odt ott ods ots odp otp odg fodt fods fodp rtf doc dot xls xlt ppt pps pot pages numbers key'
const AUDIO = 'mp3 wav ogg oga opus m4a aac flac weba'
const VIDEO = 'mp4 m4v webm ogv mov'
const CODE = 'bat cmd ps1 psm1 psd1 vbs vbe js mjs cjs ts tsx jsx sh bash zsh fish py rb pl php lua go rs c h cpp hpp cc cs java kt swift sql r ahk au3 reg inf ini cfg conf toml yml yaml env dockerfile makefile gradle properties asm s'

describe('detectPreviewKind — §R2 v1.9', () => {
  it.each([
    ['office', OFFICE],
    ['audio', AUDIO],
    ['video', VIDEO],
    ['code', CODE]
  ])('reconnaît chaque extension « %s » (MIME vide, octet-stream, majuscules)', (kind, list) => {
    for (const ext of list.split(' ')) {
      expect(detectPreviewKind('', `fichier.${ext}`), ext).toBe(kind)
      expect(detectPreviewKind('application/octet-stream', `FICHIER.${ext.toUpperCase()}`), ext).toBe(kind)
    }
  })

  it('« .key » : Keynote seulement si le MIME le permet ; clé PEM annoncée en texte → texte', () => {
    expect(detectPreviewKind('application/vnd.apple.keynote', 'deck.key')).toBe('office')
    expect(detectPreviewKind('application/x-iwork-keynote-sffkey', 'deck.key')).toBe('office')
    expect(detectPreviewKind('text/plain', 'server.key')).toBe('text')
    expect(detectPreviewKind('application/x-pem-file', 'server.key')).toBe('text')
    expect(detectPreviewKind('application/pkcs8', 'server.key')).toBe('none')
  })

  it('garde les formats de données simples en texte', () => {
    for (const ext of ['txt', 'md', 'csv', 'tsv', 'json', 'log', 'xml', 'html']) {
      expect(detectPreviewKind('', `a.${ext}`), ext).toBe('text')
    }
  })

  it('détecte par MIME quand l’extension est absente ou inconnue', () => {
    expect(detectPreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x')).toBe('office')
    expect(detectPreviewKind('application/vnd.oasis.opendocument.spreadsheet', 'x.bin')).toBe('office')
    expect(detectPreviewKind('application/msword', 'x')).toBe('office')
    expect(detectPreviewKind('text/rtf', 'x')).toBe('office')
    expect(detectPreviewKind('audio/mpeg', 'x')).toBe('audio')
    expect(detectPreviewKind('video/mp4', 'x')).toBe('video')
    expect(detectPreviewKind('application/javascript', 'x')).toBe('code')
    expect(detectPreviewKind('application/x-sh', 'x')).toBe('code')
  })

  it('l’extension l’emporte sur un MIME trompeur ou générique', () => {
    expect(detectPreviewKind('video/mp2t', 'app.ts')).toBe('code')
    expect(detectPreviewKind('text/plain', 'lancer.bat')).toBe('code')
    expect(detectPreviewKind('application/x-msdownload', 'lancer.cmd')).toBe('code')
    expect(detectPreviewKind('application/zip', 'rapport.docx')).toBe('office')
    expect(detectPreviewKind('application/vnd.ms-excel', 'export.csv')).toBe('text')
    expect(detectPreviewKind('video/ogg', 'clip.ogg')).toBe('video')
    expect(detectPreviewKind('audio/mp4', 'son.mp4')).toBe('audio')
  })

  it('reconnaît les fichiers de code sans extension', () => {
    expect(detectPreviewKind('', 'Dockerfile')).toBe('code')
    expect(detectPreviewKind('', 'dossier/Makefile')).toBe('code')
    expect(detectPreviewKind('', '.env')).toBe('code')
    expect(previewExtension('Dockerfile')).toBe('dockerfile')
    expect(previewExtension('sans-extension')).toBe('')
    expect(previewExtension('__proto__')).toBe('')
    expect(previewExtension('a.BAT')).toBe('bat')
  })
})

describe('isExecutableScript — §R2 v1.9', () => {
  it('signale les scripts exécutables', () => {
    for (const ext of ['bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'sh', 'bash', 'reg', 'ahk', 'au3', 'BAT', '.ps1']) {
      expect(isExecutableScript(ext), ext).toBe(true)
    }
  })
  it('ignore les formats inertes', () => {
    for (const ext of ['txt', 'md', 'json', 'c', 'java', 'toml', 'yml', 'docx', 'mp3', '', 'constructor']) {
      expect(isExecutableScript(ext), ext).toBe(false)
    }
  })
})

describe('fileGridPosition — import de plusieurs fichiers (§5 v1.9)', () => {
  const origin = { x: 100, y: 50 }

  it('un seul fichier reste à l’origine', () => {
    expect(fileGridPosition(origin, 0, 1)).toEqual(origin)
  })

  it('dix fichiers : grille de 4 colonnes, aucune position en double', () => {
    const positions = Array.from({ length: 10 }, (_, i) => fileGridPosition(origin, i, 10))
    expect(positions[1]).toEqual({ x: 100 + FILE_GRID_CELL.width, y: 50 })
    expect(positions[4]).toEqual({ x: 100, y: 50 + FILE_GRID_CELL.height })
    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(10)
  })

  it('entrées dégénérées bornées (total 0, index négatif)', () => {
    expect(fileGridPosition(origin, -3, 0)).toEqual(origin)
  })
})
