/**
 * Barre contextuelle d'un nœud entité/source sélectionné (§4 v1.4) — même logique
 * que la barre des liens : forme, bordure (style/épaisseur/couleur), fond
 * (couleur + opacité + transparent), taille du texte, réinitialisation, et
 * pipette de style (copier / appliquer).
 */
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Minus, Paintbrush, Pilcrow, RotateCcw, SquareDashedBottom } from 'lucide-react'
import type { BoardNodeData, EdgeStyle, EdgeWidth, EntityStyle, NodeTextSize } from '@/types'
import { useBoardContext } from '@/flow/BoardContext'
import { applyNodeStyle, resetNodeStyle, setNodeStyle } from '@/sync/boardOps'
import { ColorField } from '@/components/common/ColorPicker'
import { StatusPicker } from '@/components/board/StatusBadge'
import { colorHex } from '@/lib/colors'
import { t } from '@/i18n'
import './edgeToolbar.css'

interface NodeToolbarProps {
  node: BoardNodeData
  /** Style copié en attente d'application (pipette), ou null. */
  copiedStyle: EntityStyle | null
  onCopyStyle: (style: EntityStyle) => void
  onClose: () => void
}

function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: Array<{ id: T; icon: JSX.Element; title: string }>
  value: T
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="et-seg" role="group">
      {options.map((option) => (
        <button
          key={option.id}
          className={`et-seg__btn${option.id === value ? ' et-seg__btn--active' : ''}`}
          onClick={() => onChange(option.id)}
          title={option.title}
          aria-label={option.title}
          aria-pressed={option.id === value}
        >
          {option.icon}
        </button>
      ))}
    </div>
  )
}

export function NodeToolbar({ node, copiedStyle, onCopyStyle, onClose }: NodeToolbarProps): JSX.Element {
  const { handle, author, canEdit, setNodesStatus, pickEntityImages } = useBoardContext()
  const [borderOpen, setBorderOpen] = useState(false)
  const [fillOpen, setFillOpen] = useState(false)
  const borderRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)

  const style = node.style ?? {}
  const set = (patch: Partial<EntityStyle>): void => setNodeStyle(handle, node.id, patch, author)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (borderRef.current && !borderRef.current.contains(event.target as Node)) setBorderOpen(false)
      if (fillRef.current && !fillRef.current.contains(event.target as Node)) setFillOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const borderStyleOptions: Array<{ id: EdgeStyle; icon: JSX.Element; title: string }> = [
    { id: 'solid', icon: <Minus size={15} />, title: t('nodeStyle.borderSolid') },
    { id: 'dashed', icon: <span className="et-ico-dashed" />, title: t('nodeStyle.borderDashed') },
    { id: 'dotted', icon: <span className="et-ico-dotted" />, title: t('nodeStyle.borderDotted') }
  ]
  const widthOptions: Array<{ id: EdgeWidth; icon: JSX.Element; title: string }> = [
    { id: 'thin', icon: <span className="et-ico-w et-ico-w1" />, title: t('width.thin') },
    { id: 'normal', icon: <span className="et-ico-w et-ico-w2" />, title: t('width.normal') },
    { id: 'thick', icon: <span className="et-ico-w et-ico-w3" />, title: t('width.thick') }
  ]
  const textOptions: Array<{ id: NodeTextSize; icon: JSX.Element; title: string }> = [
    { id: 'small', icon: <span style={{ fontSize: 10 }}>A</span>, title: t('nodeStyle.textSmall') },
    { id: 'normal', icon: <span style={{ fontSize: 13 }}>A</span>, title: t('nodeStyle.textNormal') },
    { id: 'large', icon: <span style={{ fontSize: 16 }}>A</span>, title: t('nodeStyle.textLarge') }
  ]

  if (!canEdit) return <></>

  return (
    <div className="et-bar" role="toolbar" aria-label={t('nodeStyle.border')}>
      <Segmented
        options={borderStyleOptions}
        value={style.borderStyle ?? 'solid'}
        onChange={(v) => set({ borderStyle: v })}
      />
      <Segmented
        options={widthOptions}
        value={style.borderWidth ?? 'normal'}
        onChange={(v) => set({ borderWidth: v })}
      />
      {/* Couleur de bordure */}
      <div className="et-color" ref={borderRef}>
        <button
          className="et-color__swatch"
          style={{ background: colorHex(style.borderColor || node.color) }}
          onClick={() => setBorderOpen((open) => !open)}
          title={t('nodeStyle.border')}
          aria-label={t('nodeStyle.border')}
        />
        {borderOpen && (
          <div className="et-color__pop">
            <ColorField
              value={style.borderColor || node.color}
              onChange={(color) => set({ borderColor: color })}
            />
          </div>
        )}
      </div>

      <span className="et-sep" />

      {/* Fond : couleur + opacité + transparent */}
      <div className="et-color" ref={fillRef}>
        <button
          className="et-color__swatch"
          style={{
            background: style.transparentFill ? 'transparent' : colorHex(style.fillColor || node.color),
            backgroundImage: style.transparentFill
              ? 'repeating-conic-gradient(#8888 0% 25%, transparent 0% 50%)'
              : undefined,
            backgroundSize: '8px 8px'
          }}
          onClick={() => setFillOpen((open) => !open)}
          title={t('nodeStyle.background')}
          aria-label={t('nodeStyle.background')}
        >
          <Paintbrush size={11} />
        </button>
        {fillOpen && (
          <div className="et-color__pop et-fill-pop">
            <label className="et-fill-transparent">
              <input
                type="checkbox"
                checked={style.transparentFill ?? false}
                onChange={(event) => set({ transparentFill: event.target.checked })}
              />
              {t('nodeStyle.transparentBg')}
            </label>
            {!style.transparentFill && (
              <>
                <ColorField
                  value={style.fillColor || node.color}
                  onChange={(color) => set({ fillColor: color })}
                />
                <label className="et-fill-opacity">
                  {t('nodeStyle.opacity')}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((style.fillOpacity ?? 1) * 100)}
                    onChange={(event) => set({ fillOpacity: Number(event.target.value) / 100 })}
                  />
                </label>
              </>
            )}
          </div>
        )}
      </div>

      <span className="et-sep" />

      {/* Taille du texte */}
      <Segmented options={textOptions} value={style.textSize ?? 'normal'} onChange={(v) => set({ textSize: v })} />

      <span className="et-sep" />

      {/* Badge de statut (§3 v1.5). */}
      <StatusPicker
        value={node.status}
        compact
        onChange={(status) => setNodesStatus([node.id], status)}
      />

      {/* §2 v1.9 (galerie) : attacher des images à l'entité (sélecteur multiple). */}
      {node.kind === 'entity' && (
        <>
          <span className="et-sep" />
          <button
            className="et-btn"
            onClick={() => pickEntityImages(node.id)}
            title={t('entity.addImage')}
            aria-label={t('entity.addImage')}
          >
            <ImagePlus size={15} />
          </button>
        </>
      )}

      <span className="et-sep" />

      {/* Pipette de style + réinitialisation */}
      <button
        className="et-btn"
        onClick={() => onCopyStyle(node.style ?? {})}
        title={t('nodeStyle.copyStyle')}
        aria-label={t('nodeStyle.copyStyle')}
      >
        <Pilcrow size={15} />
      </button>
      <button
        className="et-btn"
        disabled={!copiedStyle}
        onClick={() => copiedStyle && applyNodeStyle(handle, node.id, copiedStyle, author)}
        title={t('nodeStyle.pasteStyle')}
        aria-label={t('nodeStyle.pasteStyle')}
      >
        <SquareDashedBottom size={15} />
      </button>
      <button
        className="et-btn"
        onClick={() => resetNodeStyle(handle, node.id, author)}
        title={t('nodeStyle.reset')}
        aria-label={t('nodeStyle.reset')}
      >
        <RotateCcw size={15} />
      </button>
      <button className="et-btn" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
        ×
      </button>
    </div>
  )
}
