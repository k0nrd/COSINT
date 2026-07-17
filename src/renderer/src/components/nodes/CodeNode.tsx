/**
 * Bloc de code (§5 v1.6) : édition sur place façon éditeur de code — coloration
 * syntaxique (Prism), numéros de ligne, police monospace, indentation préservée.
 *
 * Technique de la coloration en direct : un `<textarea>` transparent superposé à un
 * `<pre>` colorié aux MÊMES métriques (police, taille, interligne, tabulation). On
 * tape dans le textarea (caret visible, texte transparent) ; le `<pre>` en dessous
 * montre les couleurs. Le conteneur défile en bloc — pas de synchro de scroll à la
 * main. Léger (pas de Monaco/CodeMirror) et conforme à la CSP (voir lib/prism.ts).
 *
 * §5a v1.7 — DÉPLACEMENT vs ÉDITION (correctif) : un simple clic sélectionne/déplace
 * le nœud comme n'importe quel autre (le textarea est neutralisé — `pointer-events:
 * none` — tant qu'on n'édite pas, la barre de titre sert de zone de drag dédiée).
 * L'édition du code ne démarre qu'au DOUBLE-CLIC dans la zone de code (ou via le
 * bouton « Éditer »). Elle se termine au blur / Échap. Curseur adapté (déplacement
 * en aperçu, texte en édition).
 */
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { Check, Copy, Maximize2, Pencil, Search, X } from 'lucide-react'
import { t } from '@/i18n'
import { CODE_LANGUAGES, codeLanguage, highlightCode } from '@/lib/prism'
import { useBoardContext } from '@/flow/BoardContext'
import { useToasts } from '@/store/toasts'
import { Modal } from '@/components/common/Modal'
import type { CosintNodeProps } from '@/flow/flowTypes'
import { NodeShell } from './NodeShell'
import './code.css'

/** Insère `insert` à la position du caret d'un textarea et repositionne le caret. */
function insertAtCaret(
  textarea: HTMLTextAreaElement,
  insert: string,
  onChange: (value: string) => void
): void {
  const { selectionStart, selectionEnd, value } = textarea
  const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd)
  onChange(next)
  // Repositionne le caret après le texte inséré (au prochain rendu).
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length
  })
}

interface CodeEditorProps {
  value: string
  language: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onEscape?: () => void
  autoFocus?: boolean
  /** Édition interdite (visiteur) : lecture seule. */
  readOnly?: boolean
  /**
   * §5a v1.7 : `true` = mode ÉDITION (le textarea capte le pointeur, le clavier et
   * reçoit le focus) ; `false` = mode APERÇU (textarea neutralisé, le nœud reste
   * déplaçable, double-clic pour éditer). Le plein écran est toujours actif.
   */
  active: boolean
  /** Demande de passage en édition (double-clic sur l'aperçu). */
  onRequestEdit?: () => void
}

/** Éditeur colorié (textarea transparent sur `<pre>` colorié + gouttière). */
function CodeEditor({
  value,
  language,
  onChange,
  onFocus,
  onBlur,
  onEscape,
  autoFocus,
  readOnly,
  active,
  onRequestEdit
}: CodeEditorProps): JSX.Element {
  const html = useMemo(() => highlightCode(value, language), [value, language])
  // Numéros de ligne : une entrée par ligne logique (compat white-space: pre).
  const lineCount = useMemo(() => value.split('\n').length, [value])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wasActive = useRef(false)

  // §5a : quand on ENTRE en édition, donner le focus au textarea (caret en fin).
  useEffect(() => {
    if (active && !wasActive.current) {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        const end = ta.value.length
        ta.setSelectionRange(end, end)
      }
    }
    wasActive.current = active
  }, [active])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onEscape?.()
      return
    }
    // Tabulation = 2 espaces (indentation préservée, pas de perte de focus).
    if (event.key === 'Tab') {
      event.preventDefault()
      insertAtCaret(event.currentTarget, '  ', onChange)
    }
  }

  const onDoubleClick = (): void => {
    if (!active) onRequestEdit?.()
  }

  return (
    <div
      className={`nd-code-scroll nowheel${active ? ' nodrag nd-code-scroll--editing' : ''}`}
      onDoubleClick={onDoubleClick}
      title={active ? undefined : t('code.editHint')}
    >
      <div className="nd-code-inner">
        <div className="nd-code-lines" aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div className="nd-code-area">
          <pre className="nd-code-pre" aria-hidden>
            {/* eslint-disable-next-line react/no-danger */}
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
          <textarea
            ref={textareaRef}
            className={`nd-code-input${active ? '' : ' nd-code-input--locked'}`}
            value={value}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            // En aperçu, le textarea est en lecture seule ET hors tabulation :
            // aucun focus involontaire, le nœud se déplace au clic-glissé.
            readOnly={readOnly || !active}
            tabIndex={active ? 0 : -1}
            autoFocus={autoFocus}
            placeholder={t('code.placeholder')}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>
      </div>
    </div>
  )
}

interface LanguagePickerProps {
  value: string
  onChange: (id: string) => void
}

/** Menu de langage cherchable (popover façon PlatformPicker). */
function LanguagePicker({ value, onChange }: LanguagePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const current = codeLanguage(value)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const needle = query.trim().toLowerCase()
  const matches = needle === ''
    ? CODE_LANGUAGES
    : CODE_LANGUAGES.filter(
        (lang) => lang.label.toLowerCase().includes(needle) || lang.id.includes(needle)
      )

  return (
    <div className="nd-code-lang" ref={rootRef}>
      <button
        className="nd-code-lang__current nodrag"
        onClick={() => setOpen((o) => !o)}
        title={t('code.language')}
      >
        {current.label}
      </button>
      {open && (
        <div className="nd-code-lang__pop nodrag nowheel">
          <div className="nd-code-lang__search">
            <Search size={13} />
            <input
              className="cm-input"
              autoFocus
              value={query}
              placeholder={t('code.searchLanguage')}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="nd-code-lang__list">
            {matches.map((lang) => (
              <button
                key={lang.id}
                className={`nd-code-lang__opt${lang.id === value ? ' nd-code-lang__opt--active' : ''}`}
                onClick={() => {
                  onChange(lang.id)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {lang.label}
              </button>
            ))}
            {matches.length === 0 && <div className="nd-code-lang__empty">{t('code.noLanguage')}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export const CodeNode = memo(function CodeNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  const board = data.board
  const { updateNodeData, canEdit } = useBoardContext()
  const pushToast = useToasts((state) => state.push)
  const language = board.language ?? 'plaintext'

  // Brouillon local + commit au blur (convention des éditeurs de nœud). Le
  // brouillon alimente la coloration en direct ; on ne réécrit pas depuis le
  // document pendant que le champ a le focus (sinon frappe écrasée par un pair).
  const [draft, setDraft] = useState(board.content)
  const [fullscreen, setFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  // §5a v1.7 : mode édition sur place (faux = aperçu déplaçable, vrai = édition).
  const [editing, setEditing] = useState(false)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(board.content)
  }, [board.content])

  // Un nœud désélectionné ou non éditable ne doit pas rester en mode édition
  // (sinon le textarea capterait encore le pointeur et empêcherait le déplacement).
  useEffect(() => {
    if ((!selected || !canEdit) && editing) setEditing(false)
  }, [selected, canEdit, editing])

  // Commit au démontage si le nœud disparaît pendant l'édition (onlyRenderVisible).
  const stateRef = useRef({ draft, content: board.content })
  stateRef.current = { draft, content: board.content }
  useEffect(
    () => () => {
      const s = stateRef.current
      if (s.draft !== s.content) {
        try {
          updateNodeData(id, { content: s.draft })
        } catch {
          /* document en cours de destruction */
        }
      }
    },
    [id, updateNodeData]
  )

  const commit = (): void => {
    focusedRef.current = false
    if (draft !== board.content) updateNodeData(id, { content: draft })
  }

  const copyCode = (): void => {
    void window.cosint?.copyText(draft).then((ok) => {
      if (ok) {
        setCopied(true)
        pushToast(t('code.copied'), 'success')
        window.setTimeout(() => setCopied(false), 1500)
      }
    })
  }

  const editorProps = {
    value: draft,
    language,
    onChange: canEdit ? setDraft : () => {},
    onFocus: () => {
      focusedRef.current = true
    },
    readOnly: !canEdit
  }

  return (
    <NodeShell id={id} board={board} selected={selected} className="nd-code">
      {/* §5a : la barre n'est PLUS `nodrag` → elle sert de zone de déplacement.
          Chaque contrôle interactif reste `nodrag` pour rester cliquable. */}
      <div className="nd-code-bar" title={t('code.dragHint')}>
        <input
          className="nd-code-title nodrag"
          value={board.title}
          placeholder={t('code.titlePlaceholder')}
          readOnly={!canEdit}
          onChange={(event) => canEdit && updateNodeData(id, { title: event.target.value })}
        />
        <LanguagePicker
          value={language}
          onChange={(langId) => canEdit && updateNodeData(id, { language: langId })}
        />
        {canEdit && (
          <button
            className={`nd-code-btn nodrag${editing ? ' nd-code-btn--active' : ''}`}
            // §5a v1.7 : sans `preventDefault` sur mousedown, cliquer le bouton fait
            // d'abord blurer le textarea (→ setEditing(false)) puis onClick rebasculerait
            // à true → on ne sortirait jamais de l'édition. On garde donc le focus et on
            // pilote l'état ici (commit + bascule).
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (editing) {
                commit()
                setEditing(false)
                ;(document.activeElement as HTMLElement)?.blur()
              } else {
                setEditing(true)
              }
            }}
            title={editing ? t('code.editDone') : t('code.edit')}
            aria-label={editing ? t('code.editDone') : t('code.edit')}
            aria-pressed={editing}
          >
            {editing ? <Check size={14} /> : <Pencil size={14} />}
          </button>
        )}
        <button className="nd-code-btn nodrag" onClick={copyCode} title={t('code.copy')} aria-label={t('code.copy')}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          className="nd-code-btn nodrag"
          onClick={() => setFullscreen(true)}
          title={t('code.fullscreen')}
          aria-label={t('code.fullscreen')}
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <CodeEditor
        {...editorProps}
        active={editing && canEdit}
        onRequestEdit={() => canEdit && setEditing(true)}
        onBlur={() => {
          commit()
          setEditing(false)
        }}
        onEscape={() => {
          commit()
          setEditing(false)
          ;(document.activeElement as HTMLElement)?.blur()
        }}
      />

      {fullscreen && (
        <Modal
          title={board.title.trim() || t('nodeType.code')}
          width={960}
          onClose={() => {
            commit()
            setFullscreen(false)
          }}
        >
          <div className="nd-code-full">
            <div className="nd-code-bar nd-code-bar--full">
              <LanguagePicker
                value={language}
                onChange={(langId) => canEdit && updateNodeData(id, { language: langId })}
              />
              <button className="nd-code-btn" onClick={copyCode} title={t('code.copy')}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {t('code.copy')}
              </button>
              <button
                className="nd-code-btn"
                onClick={() => {
                  commit()
                  setFullscreen(false)
                }}
                title={t('common.close')}
              >
                <X size={14} />
              </button>
            </div>
            <CodeEditor
              {...editorProps}
              active
              autoFocus
              onBlur={commit}
              onEscape={() => {
                commit()
                setFullscreen(false)
              }}
            />
          </div>
        </Modal>
      )}
    </NodeShell>
  )
})
