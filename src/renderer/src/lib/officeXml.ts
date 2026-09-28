/**
 * §R2 v1.9 (aperçu bureautique) — mini-analyseur XML tolérant et BORNÉ pour les parties
 * OOXML / OpenDocument (texte déjà limité en taille par le lecteur ZIP).
 *
 * Sécurité : aucune DTD n'est interprétée (DOCTYPE ignoré), aucune entité n'est
 * développée hormis les 5 prédéfinies et les références numériques ; aucune ressource
 * externe n'est jamais suivie. Le nombre de nœuds est plafonné (arbre partiel +
 * `truncated`). Les noms sont réduits à leur nom local (préfixes d'espace de noms ôtés).
 * Pur (sans DOM) : testable sous Node.
 */

export interface XNode {
  /** Nom LOCAL de l'élément (sans préfixe). */
  name: string
  /** Attributs par nom local (premier gagnant) + nom qualifié pour les attributs préfixés (« r:id »). */
  attrs: Record<string, string>
  children: Array<XNode | string>
}

export const XML_MAX_NODES = 400_000

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function localName(qname: string): string {
  const i = qname.indexOf(':')
  return i < 0 ? qname : qname.slice(i + 1)
}

/** Décode les entités prédéfinies et numériques (les autres restent telles quelles). */
export function decodeXmlEntities(s: string): string {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,4});/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ''
      return String.fromCodePoint(code)
    }
    return ENTITIES[body] ?? m
  })
}

/** Nombre maximal d'attributs retenus par élément (au-delà : ignorés). */
const XML_MAX_ATTRS = 256

function isXmlSpace(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\t' || c === '\r'
}

/**
 * §R2 v1.9 — attributs d'une balise, en un seul passage LINÉAIRE (pas de regex à retour
 * arrière sur une balise hostile). Clé = nom local (premier gagnant) ; un attribut préfixé
 * est AUSSI rangé sous son nom qualifié (« r:id »), pour qu'un `id` et un `r:id` sur le
 * même élément (p:sldId de PowerPoint) ne s'écrasent pas.
 */
function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const n = src.length
  let count = 0
  let k = 0
  while (k < n && count < XML_MAX_ATTRS) {
    while (k < n && (isXmlSpace(src[k]) || src[k] === '/')) k++
    const start = k
    while (k < n && !isXmlSpace(src[k]) && src[k] !== '=' && src[k] !== '/' && src[k] !== '>') k++
    if (k === start) {
      k++
      continue
    }
    const qn = src.slice(start, k)
    while (k < n && isXmlSpace(src[k])) k++
    if (src[k] !== '=') continue
    k++
    while (k < n && isXmlSpace(src[k])) k++
    const q = src[k]
    if (q !== '"' && q !== "'") continue
    const end = src.indexOf(q, k + 1)
    if (end < 0) break
    const value = decodeXmlEntities(src.slice(k + 1, end))
    k = end + 1
    count++
    const key = localName(qn)
    if (!(key in attrs)) attrs[key] = value
    if (key !== qn && !(qn in attrs)) attrs[qn] = value
  }
  return attrs
}

/**
 * Identifiant de relation d'un élément OOXML (`r:id`, quel que soit le préfixe choisi),
 * avant l'éventuel `id` non préfixé (PowerPoint écrit `<p:sldId id="256" r:id="rId2"/>`).
 */
export function relId(node: XNode): string {
  const a = node.attrs
  if (a['r:id'] !== undefined) return a['r:id']
  for (const key of Object.keys(a)) if (key.endsWith(':id')) return a[key]
  return a.id ?? ''
}

/** Fenêtre de recherche d'une balise fermante dans la pile (au-delà : ignorée). */
const XML_CLOSE_WINDOW = 64
/** Budget de travail (toutes balises, fermantes/commentaires/PI compris) = maxNodes × ce facteur. */
const XML_WORK_FACTOR = 4

/**
 * Analyse `text` en temps LINÉAIRE (§R2 v1.9 : fermantes cherchées dans une fenêtre bornée,
 * chaque balise comptée dans un budget, `check` appelé toutes les 4096 itérations pour
 * le délai / l'annulation). Lève une Error si aucun élément racine n'est trouvé.
 */
export function parseXml(
  text: string,
  maxNodes = XML_MAX_NODES,
  check?: () => void
): { root: XNode; truncated: boolean } {
  const doc: XNode = { name: '#document', attrs: {}, children: [] }
  const stack: XNode[] = [doc]
  const qnames: string[] = ['']
  const maxWork = maxNodes * XML_WORK_FACTOR
  let nodes = 0
  let work = 0
  let truncated = false
  let i = 0
  const n = text.length
  while (i < n) {
    if (nodes >= maxNodes || work >= maxWork) {
      truncated = true
      break
    }
    work++
    if (check && (work & 4095) === 0) check()
    const lt = text.indexOf('<', i)
    const top = stack[stack.length - 1]
    if (lt < 0 || lt > i) {
      const raw = text.slice(i, lt < 0 ? n : lt)
      if (stack.length > 1) {
        top.children.push(decodeXmlEntities(raw))
        nodes++
      }
      if (lt < 0) break
      i = lt
      continue
    }
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4)
      i = end < 0 ? n : end + 3
    } else if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9)
      if (stack.length > 1) {
        top.children.push(text.slice(i + 9, end < 0 ? n : end))
        nodes++
      }
      i = end < 0 ? n : end + 3
    } else if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2)
      i = end < 0 ? n : end + 2
    } else if (text.startsWith('<!', i)) {
      // DOCTYPE (sous-ensemble interne compris) : ignoré, jamais interprété.
      // « [ » cherché seulement jusqu'au prochain « > » (linéaire).
      const gt = text.indexOf('>', i)
      const bracket = gt < 0 ? -1 : text.slice(i, gt).indexOf('[')
      if (bracket >= 0) {
        const end = text.indexOf(']>', i + bracket)
        i = end < 0 ? n : end + 2
      } else i = gt < 0 ? n : gt + 1
    } else if (text[i + 1] === '/') {
      const gt = text.indexOf('>', i)
      const qn = text.slice(i + 2, gt < 0 ? n : gt).trim()
      // Fenêtre bornée : une fermante orpheline ne coûte jamais O(profondeur).
      let at = -1
      for (let d = qnames.length - 1, lim = Math.max(1, qnames.length - XML_CLOSE_WINDOW); d >= lim; d--) {
        if (qnames[d] === qn) {
          at = d
          break
        }
      }
      if (at > 0) {
        stack.length = at
        qnames.length = at
      }
      i = gt < 0 ? n : gt + 1
    } else {
      // Balise ouvrante : fin au premier « > » hors guillemets.
      let j = i + 1
      let quote = ''
      for (; j < n; j++) {
        const c = text[j]
        if (quote) {
          if (c === quote) quote = ''
        } else if (c === '"' || c === "'") quote = c
        else if (c === '>') break
      }
      const selfClosing = text[j - 1] === '/'
      const inner = text.slice(i + 1, selfClosing ? j - 1 : j)
      const sp = inner.search(/[\s/]/)
      const qn = sp < 0 ? inner : inner.slice(0, sp)
      const el: XNode = { name: localName(qn), attrs: sp < 0 ? {} : parseAttrs(inner.slice(sp)), children: [] }
      top.children.push(el)
      nodes++
      if (!selfClosing) {
        stack.push(el)
        qnames.push(qn)
      }
      i = j + 1
    }
  }
  const root = doc.children.find((c): c is XNode => typeof c !== 'string')
  if (!root) throw new Error('xml: no root element')
  return { root, truncated }
}

/** Enfants éléments (optionnellement filtrés par nom local). */
export function elements(node: XNode, name?: string): XNode[] {
  const out: XNode[] = []
  for (const c of node.children) if (typeof c !== 'string' && (!name || c.name === name)) out.push(c)
  return out
}

/** Premier enfant élément de ce nom local. */
export function child(node: XNode | null | undefined, name: string): XNode | null {
  if (!node) return null
  for (const c of node.children) if (typeof c !== 'string' && c.name === name) return c
  return null
}

/** Premier descendant (parcours en profondeur itératif) de ce nom local. */
export function descendant(node: XNode, name: string): XNode | null {
  const stack: XNode[] = [node]
  while (stack.length) {
    const cur = stack.pop() as XNode
    for (let k = cur.children.length - 1; k >= 0; k--) {
      const c = cur.children[k]
      if (typeof c === 'string') continue
      if (c.name === name) return c
      stack.push(c)
    }
  }
  return null
}

/** Descendants de ce nom local, dans l'ordre du document, au plus `limit`. */
export function descendants(node: XNode, name: string, limit = Number.POSITIVE_INFINITY): XNode[] {
  const out: XNode[] = []
  const stack: XNode[] = [node]
  while (stack.length && out.length < limit) {
    const cur = stack.pop() as XNode
    for (let k = cur.children.length - 1; k >= 0; k--) {
      const c = cur.children[k]
      if (typeof c !== 'string') stack.push(c)
    }
    if (cur !== node && cur.name === name) out.push(cur)
  }
  return out
}

/** Texte concaténé de tous les descendants (borné à `max` caractères). */
export function textContent(node: XNode, max = 100_000): string {
  let out = ''
  const stack: Array<XNode | string> = [node]
  while (stack.length && out.length < max) {
    const cur = stack.pop() as XNode | string
    if (typeof cur === 'string') {
      out += cur
      continue
    }
    for (let k = cur.children.length - 1; k >= 0; k--) stack.push(cur.children[k])
  }
  return out.length > max ? out.slice(0, max) : out
}
