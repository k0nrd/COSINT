/**
 * §5 v1.9 (aperçu) — visionneuse de fichier : quel nœud « file » est affiché en grand.
 * État d'UI local (jamais synchronisé) ; la visionneuse relit le nœud en direct depuis
 * le document (un pair peut le renommer ou le supprimer pendant l'affichage).
 */
import { create } from 'zustand'

interface FilePreviewState {
  /** Nœud fichier visionné ; null = visionneuse fermée. */
  nodeId: string | null
  open: (nodeId: string) => void
  close: () => void
}

export const useFilePreview = create<FilePreviewState>((set) => ({
  nodeId: null,
  open: (nodeId) => set({ nodeId }),
  close: () => set({ nodeId: null })
}))
