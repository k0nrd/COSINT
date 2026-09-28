/**
 * §7 v1.9 — fenêtre des préréglages de lien, ouverte depuis le tableau (barre du lien,
 * sélecteur après liaison, menus contextuels). État d'UI LOCAL, jamais synchronisé.
 *
 * La fenêtre est rendue UNE fois par BoardView (`LinkPresetDialog`), hors des barres
 * flottantes (dont le `transform` casserait le positionnement `fixed` d'une modale).
 *  - `manage` : gestionnaire complet (créer, modifier, renommer, dupliquer, supprimer,
 *    réordonner) ; avec `edgeIds`, chaque préréglage propose aussi « Appliquer ».
 *  - `create` : éditeur d'un NOUVEAU préréglage, pré-rempli (`values`/`include` —
 *    ex. « Enregistrer comme préréglage » reprend le lien sélectionné) ; avec
 *    `edgeIds`, le préréglage est appliqué à ces liens dès son enregistrement.
 */
import { create } from 'zustand'
import type { LinkPresetProp, LinkPresetValues } from '@/lib/linkPresets'

export type LinkPresetDialogRequest =
  | { mode: 'manage'; edgeIds?: string[] }
  | {
      mode: 'create'
      /** Valeurs de départ du formulaire (défaut : lien neuf). */
      values?: LinkPresetValues
      /** Réglages cochés au départ. */
      include?: LinkPresetProp[]
      /** Nom proposé. */
      name?: string
      /** true si les valeurs viennent d'un lien existant (message d'aide adapté). */
      fromEdge?: boolean
      edgeIds?: string[]
    }

interface LinkPresetDialogState {
  request: LinkPresetDialogRequest | null
  open: (request: LinkPresetDialogRequest) => void
  close: () => void
}

export const useLinkPresetDialog = create<LinkPresetDialogState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null })
}))
