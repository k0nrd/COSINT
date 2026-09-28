/**
 * §7 v1.9 — fenêtre des préréglages de lien ouverte DEPUIS LE TABLEAU (barre du lien,
 * sélecteur après liaison, menus contextuels) via `useLinkPresetDialog`. Rendue une
 * seule fois par BoardView, sous le BoardContext : elle applique les préréglages aux
 * liens visés (une transaction, un pas d'annulation) si l'utilisateur peut éditer.
 */
import { useCallback, useEffect } from 'react'
import { newId } from '@/lib/id'
import {
  DEFAULT_CAPTURED_PROPS,
  DEFAULT_PRESET_VALUES,
  LINK_PRESETS_MAX,
  type LinkPresetDef
} from '@/lib/linkPresets'
import { applyEdgePreset } from '@/sync/boardOps'
import { useBoardContext } from '@/flow/BoardContext'
import { useLinkPresetDialog } from '@/store/linkPresetDialog'
import { useSettings } from '@/store/settings'
import { useToasts } from '@/store/toasts'
import { Modal } from '@/components/common/Modal'
import { LinkPresetEditor } from '@/components/board/LinkPresetEditor'
import { LinkPresetManager } from '@/components/board/LinkPresetManager'
import { t } from '@/i18n'

/**
 * Applique un préréglage à des liens et le signale (toast). Partagé par la fenêtre,
 * la barre du lien et les menus. Sans effet pour un visiteur (lecture seule).
 */
export function useApplyLinkPreset(): (edgeIds: string[], preset: LinkPresetDef) => number {
  const { handle, author, canEdit } = useBoardContext()
  const pushToast = useToasts((state) => state.push)
  return useCallback(
    (edgeIds, preset) => {
      if (!canEdit || edgeIds.length === 0) return 0
      const count = applyEdgePreset(handle, edgeIds, preset, author)
      if (count > 0) {
        pushToast(
          count === 1
            ? t('linkPreset.appliedOne', { name: preset.name })
            : t('linkPreset.appliedMany', { name: preset.name, count }),
          'success'
        )
      }
      return count
    },
    [handle, author, canEdit, pushToast]
  )
}

export function LinkPresetDialog(): JSX.Element | null {
  const request = useLinkPresetDialog((state) => state.request)
  const close = useLinkPresetDialog((state) => state.close)
  const presets = useSettings((state) => state.linkPresets)
  const addLinkPreset = useSettings((state) => state.addLinkPreset)
  const { canEdit } = useBoardContext()
  const apply = useApplyLinkPreset()

  // Quitter le tableau ferme la fenêtre (elle ne doit pas réapparaître sur un autre).
  useEffect(() => () => close(), [close])

  if (!request) return null
  const edgeIds = canEdit ? (request.edgeIds ?? []) : []

  if (request.mode === 'manage') {
    return (
      <Modal title={t('linkPreset.title')} onClose={close} width={680}>
        <LinkPresetManager
          onApply={
            edgeIds.length > 0
              ? (preset) => {
                  apply(edgeIds, preset)
                  close()
                }
              : undefined
          }
          applyCount={edgeIds.length}
        />
      </Modal>
    )
  }

  const full = presets.length >= LINK_PRESETS_MAX
  return (
    <Modal title={t('linkPreset.newTitle')} onClose={close} width={620}>
      <LinkPresetEditor
        initialName={request.name ?? ''}
        initialValues={request.values ?? DEFAULT_PRESET_VALUES}
        // Repris d'un lien : apparence + relation cochées ; préréglage vierge : rien
        // de coché (modifier une valeur coche sa case).
        initialInclude={request.include ?? (request.values ? DEFAULT_CAPTURED_PROPS : [])}
        fromEdge={request.fromEdge}
        saveLabel={edgeIds.length > 0 ? t('linkPreset.saveAndApply') : t('linkPreset.save')}
        blockedReason={full ? t('linkPreset.limit', { max: LINK_PRESETS_MAX }) : undefined}
        onSave={(name, props) => {
          const preset: LinkPresetDef = { id: newId(), name, props }
          addLinkPreset(preset)
          if (edgeIds.length > 0) apply(edgeIds, preset)
          close()
        }}
        onCancel={close}
      />
    </Modal>
  )
}
