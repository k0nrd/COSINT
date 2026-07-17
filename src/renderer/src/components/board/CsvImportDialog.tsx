/**
 * Assistant d'import CSV (§1 v1.7) : deux modes — « Automatique » (détection +
 * heuristiques + disposition) et « Assisté » (assistant en étapes : format → type →
 * colonnes → liens → disposition). Aperçu des premières lignes ; import non destructif
 * (ajout au tableau courant ou nouveau tableau) ; garde-fou au-delà d'un seuil de
 * lignes. Le parsing/heuristiques/construction vivent dans lib/csv*.
 */
import { useEffect, useMemo, useState } from 'react'
import { t } from '@/i18n'
import { Modal } from '@/components/common/Modal'
import { parseCsv, type CsvDelimiter } from '@/lib/csv'
import {
  buildGraph,
  columnLabel,
  inferMapping,
  type ColumnTarget,
  type ImportMapping
} from '@/lib/csvSchema'
import { TAXONOMY_CATEGORIES, typesOfCategory } from '@/lib/taxonomy'
import { entityTypeLabelKey } from '@/components/nodes/EntityNode'
import type { BoardEdgeData, BoardNodeData } from '@/types'
import './csv.css'

/** Au-delà de ce nombre de lignes, on avertit avant de générer (perf). */
const WARN_THRESHOLD = 2000
const PREVIEW_ROWS = 6
const FIELD_KINDS = ['text', 'longtext', 'url', 'email', 'phone', 'date'] as const

interface CsvImportDialogProps {
  csvText: string
  encoding?: string
  author: string
  onClose: () => void
  onImportHere: (nodes: BoardNodeData[], edges: BoardEdgeData[]) => void
  onImportNewBoard: (nodes: BoardNodeData[], edges: BoardEdgeData[], title: string) => void
}

/** Menu déroulant des types d'entité, groupés par catégorie (taxonomie). */
function TypeSelect({ value, onChange }: { value: string; onChange: (id: string) => void }): JSX.Element {
  return (
    <select className="csv-select" value={value} onChange={(event) => onChange(event.target.value)}>
      {TAXONOMY_CATEGORIES.map((category) => (
        <optgroup key={category.id} label={t(category.nameKey)}>
          {typesOfCategory(category.id).map((type) => (
            <option key={type.id} value={type.id}>
              {t(entityTypeLabelKey(type.id))}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function CsvImportDialog({
  csvText,
  encoding,
  author,
  onClose,
  onImportHere,
  onImportNewBoard
}: CsvImportDialogProps): JSX.Element {
  const initial = useMemo(() => parseCsv(csvText), [csvText])
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(initial.delimiter)
  const [hasHeader, setHasHeader] = useState<boolean>(initial.hasHeader)
  const parsed = useMemo(
    () => parseCsv(csvText, { delimiter, hasHeader }),
    [csvText, delimiter, hasHeader]
  )
  const [mapping, setMapping] = useState<ImportMapping>(() => inferMapping(parsed))
  // Re-déduit le mapping quand le FORMAT change (séparateur / en-tête).
  useEffect(() => setMapping(inferMapping(parsed)), [parsed])

  const [mode, setMode] = useState<'choose' | 'auto' | 'assisted'>('choose')
  const [step, setStep] = useState(0)
  const [destination, setDestination] = useState<'here' | 'new'>('here')
  const [error, setError] = useState<string | null>(null)

  // Si un NOUVEAU fichier arrive alors que l'assistant est déjà ouvert (ex. 2e drop),
  // on repart de zéro : format re-détecté et retour au choix du mode.
  useEffect(() => {
    setDelimiter(initial.delimiter)
    setHasHeader(initial.hasHeader)
    setMode('choose')
    setStep(0)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvText])

  const rowCount = parsed.rows.length
  const width = parsed.header?.length ?? parsed.rows.reduce((max, row) => Math.max(max, row.length), 0)

  const patchMapping = (patch: Partial<ImportMapping>): void => setMapping((prev) => ({ ...prev, ...patch }))
  const patchColumn = (index: number, patch: Partial<ImportMapping['columns'][number]>): void =>
    setMapping((prev) => ({
      ...prev,
      columns: prev.columns.map((column) => (column.index === index ? { ...column, ...patch } : column))
    }))

  const runImport = (): void => {
    if (rowCount > WARN_THRESHOLD && !window.confirm(t('csv.warnLarge', { count: rowCount }))) return
    const built = buildGraph(parsed, mapping, author, { x: 0, y: 0 })
    if (built.nodes.length === 0) {
      setError(t('csv.importEmpty'))
      return
    }
    if (destination === 'here') onImportHere(built.nodes, built.edges)
    else onImportNewBoard(built.nodes, built.edges, t('home.newBoardTitle'))
    onClose()
  }

  // ——— Aperçu du CSV (en-tête + premières lignes) ———
  const previewHeader = parsed.header ?? Array.from({ length: width }, (_, i) => columnLabel(null, i))
  const preview = (
    <div className="csv-preview">
      <table className="csv-preview__table">
        <thead>
          <tr>
            {previewHeader.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
            <tr key={r}>
              {Array.from({ length: width }, (_, c) => (
                <td key={c}>{row[c] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="csv-preview__meta">
        {t('csv.import.rowsDetected', { count: rowCount })}
        {encoding ? ` · ${t('csv.encoding')} : ${encoding}` : ''}
      </div>
    </div>
  )

  // ——— Destination (ici / nouveau tableau) — commune aux deux modes ———
  const destinationChooser = (
    <div className="csv-field">
      <label className="csv-field__label">{t('csv.target.destination')}</label>
      <div className="csv-radios">
        <label>
          <input
            type="radio"
            checked={destination === 'here'}
            onChange={() => setDestination('here')}
          />{' '}
          {t('csv.addToBoard')}
        </label>
        <label>
          <input type="radio" checked={destination === 'new'} onChange={() => setDestination('new')} />{' '}
          {t('csv.newBoard')}
        </label>
      </div>
    </div>
  )

  // ——— Contenu selon le mode/étape ———
  let body: JSX.Element
  let footer: JSX.Element

  if (mode === 'choose') {
    body = (
      <>
        {preview}
        <div className="csv-modes">
          <button className="csv-mode" onClick={() => setMode('auto')}>
            <span className="csv-mode__title">{t('csv.import.auto')}</span>
            <span className="csv-mode__desc">{t('csv.import.autoDesc')}</span>
          </button>
          <button className="csv-mode" onClick={() => { setMode('assisted'); setStep(0) }}>
            <span className="csv-mode__title">{t('csv.import.assisted')}</span>
            <span className="csv-mode__desc">{t('csv.import.assistedDesc')}</span>
          </button>
        </div>
      </>
    )
    footer = (
      <button className="cm-btn cm-btn--ghost" onClick={onClose}>
        {t('common.close')}
      </button>
    )
  } else if (mode === 'auto') {
    body = (
      <>
        {preview}
        <p className="csv-auto-summary">{t('csv.import.autoDesc')}</p>
        {destinationChooser}
        {error && <div className="csv-error">{error}</div>}
      </>
    )
    footer = (
      <>
        <button className="cm-btn cm-btn--ghost" onClick={() => setMode('choose')}>
          {t('csv.import.back')}
        </button>
        <button className="cm-btn cm-btn--primary" onClick={runImport}>
          {t('csv.import.run')}
        </button>
      </>
    )
  } else {
    // ——— Mode assisté : 5 étapes ———
    const steps = ['csv.step.format', 'csv.step.type', 'csv.step.columns', 'csv.step.links', 'csv.step.layout']
    const stepper = (
      <ol className="csv-stepper">
        {steps.map((key, i) => (
          <li key={key} className={i === step ? 'csv-stepper__item--active' : i < step ? 'csv-stepper__item--done' : ''}>
            {t(key as Parameters<typeof t>[0])}
          </li>
        ))}
      </ol>
    )

    let stepBody: JSX.Element
    if (step === 0) {
      stepBody = (
        <div className="csv-step">
          <div className="csv-field">
            <label className="csv-field__label">{t('csv.delimiter')}</label>
            <select
              className="csv-select"
              value={delimiter}
              onChange={(event) => setDelimiter(event.target.value as CsvDelimiter)}
            >
              <option value=",">{t('csv.delimiterComma')}</option>
              <option value=";">{t('csv.delimiterSemicolon')}</option>
              <option value={'\t'}>{t('csv.delimiterTab')}</option>
            </select>
          </div>
          <label className="csv-check">
            <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} />
            {t('csv.hasHeader')}
          </label>
          {encoding && (
            <div className="csv-field__hint">
              {t('csv.encoding')} : {encoding}
            </div>
          )}
        </div>
      )
    } else if (step === 1) {
      stepBody = (
        <div className="csv-step">
          <div className="csv-radios csv-radios--stack">
            <label>
              <input
                type="radio"
                checked={mapping.typeMode === 'auto'}
                onChange={() => patchMapping({ typeMode: 'auto' })}
              />{' '}
              {t('csv.typeMode.auto')}
            </label>
            <label>
              <input
                type="radio"
                checked={mapping.typeMode === 'single'}
                onChange={() => patchMapping({ typeMode: 'single' })}
              />{' '}
              {t('csv.typeMode.single')}
            </label>
            <label>
              <input
                type="radio"
                checked={mapping.typeMode === 'column'}
                onChange={() => patchMapping({ typeMode: 'column', typeColumn: mapping.typeColumn ?? 0 })}
              />{' '}
              {t('csv.typeMode.column')}
            </label>
          </div>
          {mapping.typeMode === 'single' && (
            <div className="csv-field">
              <label className="csv-field__label">{t('csv.chooseType')}</label>
              <TypeSelect value={mapping.singleType} onChange={(id) => patchMapping({ singleType: id })} />
            </div>
          )}
          {mapping.typeMode === 'column' && (
            <div className="csv-field">
              <label className="csv-field__label">{t('csv.typeColumn')}</label>
              <select
                className="csv-select"
                value={mapping.typeColumn ?? 0}
                onChange={(event) => patchMapping({ typeColumn: Number(event.target.value) })}
              >
                {mapping.columns.map((column) => (
                  <option key={column.index} value={column.index}>
                    {column.header}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )
    } else if (step === 2) {
      stepBody = (
        <div className="csv-step csv-columns">
          {mapping.columns.map((column) => (
            <div key={column.index} className="csv-column-row">
              <span className="csv-column-row__name" title={column.header}>
                {column.header}
              </span>
              <select
                className="csv-select"
                value={column.target}
                onChange={(event) => patchColumn(column.index, { target: event.target.value as ColumnTarget })}
              >
                <option value="field">{t('csv.target.field')}</option>
                <option value="title">{t('csv.target.title')}</option>
                <option value="type">{t('csv.target.type')}</option>
                <option value="ignore">{t('csv.target.ignore')}</option>
              </select>
              {column.target === 'field' && (
                <select
                  className="csv-select csv-select--kind"
                  value={column.fieldKind}
                  onChange={(event) =>
                    patchColumn(column.index, { fieldKind: event.target.value as (typeof FIELD_KINDS)[number] })
                  }
                >
                  {FIELD_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )
    } else if (step === 3) {
      const linkMode = mapping.sourceColumn !== null ? 'columns' : mapping.linkSharedValues ? 'shared' : 'none'
      stepBody = (
        <div className="csv-step">
          <div className="csv-radios csv-radios--stack">
            <label>
              <input
                type="radio"
                checked={linkMode === 'none'}
                onChange={() => patchMapping({ sourceColumn: null, targetColumn: null, linkSharedValues: false })}
              />{' '}
              {t('csv.links.none')}
            </label>
            <label>
              <input
                type="radio"
                checked={linkMode === 'columns'}
                onChange={() =>
                  patchMapping({ sourceColumn: 0, targetColumn: Math.min(1, width - 1), linkSharedValues: false })
                }
              />{' '}
              {t('csv.links.columns')}
            </label>
            <label>
              <input
                type="radio"
                checked={linkMode === 'shared'}
                onChange={() =>
                  patchMapping({ sourceColumn: null, targetColumn: null, linkSharedValues: true, sharedKeyColumns: mapping.sharedKeyColumns })
                }
              />{' '}
              {t('csv.links.shared')}
            </label>
          </div>
          {linkMode === 'columns' && (
            <div className="csv-link-cols">
              <div className="csv-field">
                <label className="csv-field__label">{t('csv.links.sourceCol')}</label>
                <select
                  className="csv-select"
                  value={mapping.sourceColumn ?? 0}
                  onChange={(event) => patchMapping({ sourceColumn: Number(event.target.value) })}
                >
                  {mapping.columns.map((c) => (
                    <option key={c.index} value={c.index}>{c.header}</option>
                  ))}
                </select>
              </div>
              <div className="csv-field">
                <label className="csv-field__label">{t('csv.links.targetCol')}</label>
                <select
                  className="csv-select"
                  value={mapping.targetColumn ?? 0}
                  onChange={(event) => patchMapping({ targetColumn: Number(event.target.value) })}
                >
                  {mapping.columns.map((c) => (
                    <option key={c.index} value={c.index}>{c.header}</option>
                  ))}
                </select>
              </div>
              <div className="csv-field">
                <label className="csv-field__label">{t('csv.links.relationCol')}</label>
                <select
                  className="csv-select"
                  value={mapping.relationColumn ?? -1}
                  onChange={(event) =>
                    patchMapping({ relationColumn: Number(event.target.value) < 0 ? null : Number(event.target.value) })
                  }
                >
                  <option value={-1}>—</option>
                  {mapping.columns.map((c) => (
                    <option key={c.index} value={c.index}>{c.header}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {linkMode === 'shared' && (
            <div className="csv-field">
              <label className="csv-field__label">{t('csv.links.keyColumns')}</label>
              <div className="csv-check-list">
                {mapping.columns.map((c) => (
                  <label key={c.index} className="csv-check">
                    <input
                      type="checkbox"
                      checked={mapping.sharedKeyColumns.includes(c.index)}
                      onChange={(event) =>
                        patchMapping({
                          sharedKeyColumns: event.target.checked
                            ? [...mapping.sharedKeyColumns, c.index]
                            : mapping.sharedKeyColumns.filter((i) => i !== c.index)
                        })
                      }
                    />
                    {c.header}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    } else {
      stepBody = (
        <div className="csv-step">
          <div className="csv-field">
            <label className="csv-field__label">{t('csv.step.layout')}</label>
            <div className="csv-radios">
              <label>
                <input
                  type="radio"
                  checked={mapping.layout === 'grid'}
                  onChange={() => patchMapping({ layout: 'grid' })}
                />{' '}
                {t('csv.layout.grid')}
              </label>
              <label>
                <input
                  type="radio"
                  checked={mapping.layout === 'graph'}
                  onChange={() => patchMapping({ layout: 'graph' })}
                />{' '}
                {t('csv.layout.graph')}
              </label>
            </div>
          </div>
          {destinationChooser}
          {error && <div className="csv-error">{error}</div>}
        </div>
      )
    }

    body = (
      <>
        {stepper}
        {step === 0 && preview}
        {stepBody}
      </>
    )
    footer = (
      <>
        <button
          className="cm-btn cm-btn--ghost"
          onClick={() => (step === 0 ? setMode('choose') : setStep((s) => s - 1))}
        >
          {t('csv.import.back')}
        </button>
        {step < 4 ? (
          <button className="cm-btn cm-btn--primary" onClick={() => setStep((s) => s + 1)}>
            {t('csv.import.next')}
          </button>
        ) : (
          <button className="cm-btn cm-btn--primary" onClick={runImport}>
            {t('csv.import.run')}
          </button>
        )}
      </>
    )
  }

  return (
    <Modal title={t('csv.import.title')} width={720} onClose={onClose} footer={footer}>
      {body}
    </Modal>
  )
}
