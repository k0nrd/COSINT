/**
 * Dialogue de choix des colonnes pour l'export CSV (§4 v1.8).
 *
 * Présente les colonnes disponibles pour l'export courant (entités ou liens) en
 * cases à cocher — groupées en « structurelles » (type, titre, statut, datation…)
 * et « champs » (un par libellé de champ présent) — plus le choix du séparateur.
 * Tout est coché par défaut (l'utilisateur DÉ-coche ce qu'il ne veut pas). Le
 * dialogue ne connaît pas la donnée : il renvoie la sélection (ids + séparateur) à
 * l'appelant, qui construit le CSV et écrit le fichier.
 */
import { useMemo, useState } from 'react'
import { t } from '@/i18n'
import { Modal } from '@/components/common/Modal'
import type { CsvDelimiter } from '@/lib/csv'
import './csv.css'

/** Colonne telle qu'affichée par le dialogue (indépendante du type de donnée). */
export interface ExportColumnInfo {
  id: string
  header: string
  group: 'fixed' | 'field'
}

interface CsvExportDialogProps {
  title: string
  columns: ReadonlyArray<ExportColumnInfo>
  onClose: () => void
  /** Appelé à la confirmation avec les ids cochés (dans l'ordre d'origine) et le séparateur. */
  onConfirm: (selectedIds: string[], delimiter: CsvDelimiter) => void
}

export function CsvExportDialog({
  title,
  columns,
  onClose,
  onConfirm
}: CsvExportDialogProps): JSX.Element {
  // Tout coché par défaut (l'export historique exportait toutes les données).
  const [selected, setSelected] = useState<Set<string>>(() => new Set(columns.map((c) => c.id)))
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',')

  const fixed = useMemo(() => columns.filter((c) => c.group === 'fixed'), [columns])
  const fields = useMemo(() => columns.filter((c) => c.group === 'field'), [columns])

  const toggle = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setAll = (on: boolean): void =>
    setSelected(on ? new Set(columns.map((c) => c.id)) : new Set())

  const count = selected.size
  const allChecked = count === columns.length

  const renderColumn = (column: ExportColumnInfo): JSX.Element => (
    <label key={column.id} className="csvx__col">
      <input
        type="checkbox"
        checked={selected.has(column.id)}
        onChange={() => toggle(column.id)}
      />
      <span className="csvx__col-name">{column.header}</span>
    </label>
  )

  const footer = (
    <>
      <button className="cm-btn cm-btn--ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button
        className="cm-btn cm-btn--primary"
        disabled={count === 0}
        onClick={() =>
          // Conserve l'ORDRE d'origine des colonnes (pas l'ordre de cochage).
          onConfirm(
            columns.filter((c) => selected.has(c.id)).map((c) => c.id),
            delimiter
          )
        }
      >
        {t('csv.exportConfirm', { count })}
      </button>
    </>
  )

  return (
    <Modal title={title} onClose={onClose} footer={footer} width={540}>
      <div className="csvx">
        <p className="csvx__hint">{t('csv.exportColumnsHint')}</p>

        <div className="csvx__toolbar">
          <button
            className="cm-btn cm-btn--ghost cm-btn--sm"
            onClick={() => setAll(true)}
            disabled={allChecked}
          >
            {t('csv.selectAll')}
          </button>
          <button
            className="cm-btn cm-btn--ghost cm-btn--sm"
            onClick={() => setAll(false)}
            disabled={count === 0}
          >
            {t('csv.selectNone')}
          </button>
          <span className="csvx__count">{t('csv.selectedCount', { count, total: columns.length })}</span>
        </div>

        <div className="csvx__scroll">
          <div className="csvx__group-label">{t('csv.colGroupFixed')}</div>
          <div className="csvx__grid">{fixed.map(renderColumn)}</div>

          {fields.length > 0 && (
            <>
              <div className="csvx__group-label">{t('csv.colGroupFields')}</div>
              <div className="csvx__grid">{fields.map(renderColumn)}</div>
            </>
          )}
        </div>

        <div className="csvx__delim">
          <label className="csvx__delim-label" htmlFor="csvx-delim">
            {t('csv.delimiter')}
          </label>
          <select
            id="csvx-delim"
            className="csv-select"
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value as CsvDelimiter)}
          >
            <option value=",">{t('csv.delimiterComma')}</option>
            <option value=";">{t('csv.delimiterSemicolon')}</option>
            <option value={'\t'}>{t('csv.delimiterTab')}</option>
          </select>
        </div>
      </div>
    </Modal>
  )
}
