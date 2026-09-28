import { describe, expect, it } from 'vitest'
import {
  MAX_HIGHLIGHT_CHARS,
  buildCodePreview,
  codeGrammarForExt,
  codeLanguageLabel,
  decodeCodeBytes,
  decodeCp850,
  escapeCodeHtml,
  highlightCode,
  highlightCodeLines,
  preferCp850
} from '../src/renderer/src/lib/codePreview'

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')
const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('§R2 codeGrammarForExt / codeLanguageLabel', () => {
  it('maps script and source extensions to Prism grammars', () => {
    expect(codeGrammarForExt('bat')).toBe('batch')
    expect(codeGrammarForExt('.CMD')).toBe('batch')
    expect(codeGrammarForExt('ps1')).toBe('powershell')
    expect(codeGrammarForExt('vbs')).toBe('visual-basic')
    expect(codeGrammarForExt('sh')).toBe('bash')
    expect(codeGrammarForExt('py')).toBe('python')
    expect(codeGrammarForExt('tsx')).toBe('tsx')
    expect(codeGrammarForExt('rs')).toBe('rust')
    expect(codeGrammarForExt('kt')).toBe('kotlin')
    expect(codeGrammarForExt('toml')).toBe('toml')
    expect(codeGrammarForExt('dockerfile')).toBe('docker')
    expect(codeGrammarForExt('makefile')).toBe('makefile')
    expect(codeGrammarForExt('asm')).toBe('nasm')
    expect(codeGrammarForExt('unknown')).toBe('')
    expect(codeGrammarForExt('__proto__')).toBe('')
  })

  it('every mapped grammar is actually loaded', () => {
    for (const ext of ['bat', 'ps1', 'vbs', 'rb', 'pl', 'lua', 'kt', 'swift', 'r', 'ahk', 'au3',
      'ini', 'toml', 'dockerfile', 'makefile', 'gradle', 'properties', 'asm', 'go', 'php', 'yaml']) {
      // Une grammaire chargée produit au moins un jeton coloré sur un texte non vide.
      expect(highlightCode(ext === 'dockerfile' ? 'FROM x\n' : 'x = 1 # "a"\n', ext), ext).toMatch(/class="token/)
    }
  })

  it('gives readable language labels', () => {
    expect(codeLanguageLabel('ps1')).toBe('PowerShell')
    expect(codeLanguageLabel('cs')).toBe('C#')
    expect(codeLanguageLabel('xyz')).toBe('XYZ')
    expect(codeLanguageLabel('')).toBe('')
  })
})

describe('§R2 highlighting stays escaped', () => {
  it('never lets file markup through', () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(1)>'
    for (const ext of ['js', 'bat', 'ps1', 'unknown']) {
      const html = highlightCode(evil, ext)
      expect(html).not.toMatch(/<script|<img/i)
      for (const line of highlightCodeLines(evil, ext)) expect(line).not.toMatch(/<script|<img/i)
    }
    expect(escapeCodeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
  })

  it('splits into self-contained lines (spans closed and reopened)', () => {
    const lines = highlightCodeLines('/* a\nb */\nconst x = 1', 'js')
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect((line.match(/<span/g) ?? []).length).toBe((line.match(/<\/span>/g) ?? []).length)
    }
    expect(lines[1]).toContain('token comment')
  })

  it('falls back to plain escaped lines when too long or unknown', () => {
    const long = 'a<b\n'.repeat(Math.ceil(MAX_HIGHLIGHT_CHARS / 4) + 10)
    const lines = highlightCodeLines(long, 'js')
    expect(lines[0]).toBe('a&lt;b')
    expect(highlightCodeLines('x<y', 'zzz')).toEqual(['x&lt;y'])
  })
})

describe('§R2 decoding choice', () => {
  // « Répertoire créé » en OEM 850 (é = 0x82) et en windows-1252 (é = 0xE9).
  const oem = new Uint8Array([...enc('echo R'), 0x82, ...enc('pertoire cr'), 0x82, 0x82])
  const ansi = new Uint8Array([...enc('echo R'), 0xe9, ...enc('pertoire cr'), 0xe9, 0xe9])

  it('decodes IBM850 with the built-in table', () => {
    expect(decodeCp850(new Uint8Array([0x82, 0x85, 0x87, 0x41]))).toBe('éàçA')
  })

  it('keeps UTF-8 when valid, even for .bat', () => {
    expect(decodeCodeBytes(enc('echo Répertoire'), 'bat').encoding).toBe('UTF-8')
  })

  it('chooses IBM850 for console-encoded .bat/.cmd', () => {
    expect(preferCp850(oem)).toBe(true)
    const d = decodeCodeBytes(oem, 'cmd')
    expect(d.encoding).toBe('IBM850')
    expect(d.text).toBe('echo Répertoire créé')
  })

  it('keeps windows-1252 for ANSI .bat and for non-batch files', () => {
    expect(preferCp850(ansi)).toBe(false)
    expect(decodeCodeBytes(ansi, 'bat').encoding).toBe('windows-1252')
    expect(decodeCodeBytes(ansi, 'bat').text).toBe('echo Répertoire créé')
    expect(decodeCodeBytes(oem, 'ps1').encoding).toBe('windows-1252')
  })

  it('buildCodePreview bounds lines, flags truncation and binary', () => {
    const src = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
    const p = buildCodePreview(b64(enc(src)), 'py', { bytes: 1024, chars: 4000, lines: 20 })
    expect(p.text.split('\n')).toHaveLength(20)
    expect(p.truncated).toBe(true)
    const big = buildCodePreview(b64(enc('x'.repeat(5000))), 'py', { bytes: 100, chars: 4000, lines: 20 })
    expect(big.text.length).toBe(100)
    expect(big.truncated).toBe(true)
    expect(buildCodePreview(b64(new Uint8Array([1, 0, 2])), 'sh', { bytes: 100, chars: 100, lines: 5 }).binary).toBe(true)
  })

  it('neutralises bidi controls in code', () => {
    const p = buildCodePreview(b64(enc('a\u202eb')), 'js', { bytes: 100, chars: 100, lines: 5 })
    expect(p.text).toBe('a\uFFFDb')
  })
})
