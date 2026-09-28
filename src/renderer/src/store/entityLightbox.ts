/**
 * §2 v1.9 (galerie) — visionneuse des images d'une entité : quelle entité et quelle
 * image sont affichées en grand. État d'UI local (jamais synchronisé) ; la visionneuse
 * relit la galerie en direct depuis le document (un pair peut la modifier pendant
 * l'affichage).
 */
import { create } from 'zustand'

interface EntityLightboxState {
  /** Entité dont on visionne les images ; null = visionneuse fermée. */
  nodeId: string | null
  /** Index de l'image affichée dans la galerie. */
  index: number
  open: (nodeId: string, index?: number) => void
  setIndex: (index: number) => void
  close: () => void
}

export const useEntityLightbox = create<EntityLightboxState>((set) => ({
  nodeId: null,
  index: 0,
  open: (nodeId, index = 0) => set({ nodeId, index: Math.max(0, Math.floor(index)) }),
  setIndex: (index) => set({ index: Math.max(0, Math.floor(index)) }),
  close: () => set({ nodeId: null, index: 0 })
}))
