/**
 * Coloration syntaxique des blocs de code (§5 v1.6).
 *
 * Choix : Prism.js (voir DECISIONS.md) — bibliothèque légère, empaquetée depuis
 * `node_modules` (donc conforme à la CSP stricte `script-src 'self'`, aucun accès
 * réseau), plutôt que Monaco (trop lourd pour le .exe) ou CodeMirror. L'édition
 * « avec coloration en direct » est obtenue par la technique du textarea
 * transparent superposé à un `<pre>` colorié (voir CodeNode). On n'importe PAS de
 * thème Prism : les couleurs sont définies dans `code.css` via les variables du
 * thème (cohérence sombre/clair).
 *
 * Les grammaires sont importées STATIQUEMENT (pas d'autoloader réseau) dans l'ordre
 * de leurs dépendances (markup/clike avant leurs dérivés).
 */
import Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-bash'
// prism-php enregistre un hook « after-tokenize » GLOBAL qui déréférence
// Prism.languages['markup-templating'] : sans cet import préalable, CHAQUE appel à
// Prism.highlight (tous langages) lèverait et la coloration serait silencieusement
// désactivée (le try/catch de highlightCode retomberait sur le texte brut).
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'

export interface CodeLanguage {
  /** Id stocké dans `node.language` (stable, jamais traduit). */
  id: string
  /** Libellé affiché dans le menu (nom propre, non traduit). */
  label: string
  /** Clé de grammaire Prism ; '' = texte brut (aucune coloration). */
  grammar: string
}

/**
 * Langages proposés (§5). Au minimum ceux demandés par le cahier des charges.
 * L'ordre pilote l'affichage du menu.
 */
export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: 'plaintext', label: 'Texte brut', grammar: '' },
  { id: 'javascript', label: 'JavaScript', grammar: 'javascript' },
  { id: 'typescript', label: 'TypeScript', grammar: 'typescript' },
  { id: 'jsx', label: 'JSX (React)', grammar: 'jsx' },
  { id: 'tsx', label: 'TSX (React)', grammar: 'tsx' },
  { id: 'python', label: 'Python', grammar: 'python' },
  { id: 'html', label: 'HTML', grammar: 'markup' },
  { id: 'css', label: 'CSS', grammar: 'css' },
  { id: 'json', label: 'JSON', grammar: 'json' },
  { id: 'sql', label: 'SQL', grammar: 'sql' },
  { id: 'bash', label: 'Bash / Shell', grammar: 'bash' },
  { id: 'php', label: 'PHP', grammar: 'php' },
  { id: 'java', label: 'Java', grammar: 'java' },
  { id: 'c', label: 'C', grammar: 'c' },
  { id: 'cpp', label: 'C++', grammar: 'cpp' },
  { id: 'csharp', label: 'C#', grammar: 'csharp' },
  { id: 'go', label: 'Go', grammar: 'go' },
  { id: 'rust', label: 'Rust', grammar: 'rust' },
  { id: 'yaml', label: 'YAML', grammar: 'yaml' },
  { id: 'markdown', label: 'Markdown', grammar: 'markdown' }
]

const LANG_BY_ID = new Map(CODE_LANGUAGES.map((lang) => [lang.id, lang]))

/** Langage par id, repli sur « texte brut » si inconnu (id supprimé/erroné). */
export function codeLanguage(id: string | undefined): CodeLanguage {
  return (id && LANG_BY_ID.get(id)) || CODE_LANGUAGES[0]
}

/** Échappe le HTML (blocs sans grammaire = texte brut). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Renvoie le HTML colorié d'un extrait pour un langage donné. Pour le texte brut
 * (ou une grammaire absente), on renvoie le texte échappé sans coloration.
 */
export function highlightCode(code: string, langId: string | undefined): string {
  const lang = codeLanguage(langId)
  if (lang.grammar === '') return escapeHtml(code)
  const grammar = Prism.languages[lang.grammar]
  if (!grammar) return escapeHtml(code)
  try {
    return Prism.highlight(code, grammar, lang.grammar)
  } catch {
    // Une grammaire défaillante ne doit jamais casser l'affichage du nœud.
    return escapeHtml(code)
  }
}
