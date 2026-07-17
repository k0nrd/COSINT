/**
 * Mini-moteur markdown maison (§3 : gras, italique, listes) — voir DECISIONS.md n°5.
 *
 * Sécurité (§8) : TOUT le texte source est échappé en entités HTML avant le moindre
 * formatage. Aucune balise, aucun attribut, aucun protocole ne peut être injecté :
 * seul le HTML généré ici (strong/em/code/ul/ol/li/p/br) existe en sortie.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Formatage inline sur du texte DÉJÀ échappé : gras, italique, code. */
function renderInline(escaped: string): string {
  return (
    escaped
      // **gras** puis __gras__
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      // *italique* puis _italique_
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1<em>$2</em>')
      // `code`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
  )
}

/**
 * Convertit du markdown simple en HTML sûr.
 * Supporte : **gras**, *italique*, `code`, listes à puces (- ou *) et numérotées (1.).
 */
export function renderMarkdown(source: string): string {
  const lines = source.split(/\r?\n/)
  const html: string[] = []
  let listMode: 'ul' | 'ol' | null = null
  let paragraph: string[] = []

  const closeList = (): void => {
    if (listMode) {
      html.push(`</${listMode}>`)
      listMode = null
    }
  }
  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.join('<br>')}</p>`)
      paragraph = []
    }
  }

  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)

    if (bullet || numbered) {
      flushParagraph()
      const wanted: 'ul' | 'ol' = bullet ? 'ul' : 'ol'
      if (listMode !== wanted) {
        closeList()
        html.push(`<${wanted}>`)
        listMode = wanted
      }
      const content = (bullet ? bullet[1] : numbered![1]).trim()
      html.push(`<li>${renderInline(escapeHtml(content))}</li>`)
    } else if (line.trim() === '') {
      closeList()
      flushParagraph()
    } else {
      closeList()
      paragraph.push(renderInline(escapeHtml(line)))
    }
  }
  closeList()
  flushParagraph()
  return html.join('')
}
