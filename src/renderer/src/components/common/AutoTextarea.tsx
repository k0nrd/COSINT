/**
 * Zone de texte à hauteur automatique (§4 v1.6).
 *
 * Généralise l'auto-grandissement (déjà présent au niveau des nœuds entité/source,
 * §6bis v1.4) à tous les champs de saisie multiligne : la hauteur s'ajuste au
 * contenu PENDANT la saisie (aucun texte masqué, aucun scroll interne caché),
 * jusqu'à une hauteur max au-delà de laquelle un scroll vertical apparaît.
 *
 * Composant contrôlé : il transmet toutes les props d'un `<textarea>` standard et
 * ne fait qu'ajouter la mesure de hauteur (effet de mise en page rejoué à chaque
 * changement de `value`). Le `ref` éventuel est fusionné avec le ref interne.
 */
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes
} from 'react'

export interface AutoTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Hauteur maximale (px) avant apparition du scroll interne. Défaut 320. */
  maxHeight?: number
  /** Hauteur minimale (px) appliquée avant mesure. Défaut : hauteur d'une ligne. */
  minHeight?: number
}

/** Ajuste la hauteur d'un textarea à son contenu, borné par `maxHeight`. */
export function resizeTextarea(el: HTMLTextAreaElement, maxHeight: number, minHeight?: number): void {
  // On remet la hauteur à zéro avant de lire scrollHeight, sinon la hauteur
  // courante empêche la zone de RÉTRÉCIR quand on efface du texte.
  el.style.height = 'auto'
  const target = Math.max(minHeight ?? 0, Math.min(el.scrollHeight, maxHeight))
  el.style.height = `${target}px`
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

export const AutoTextarea = forwardRef<HTMLTextAreaElement, AutoTextareaProps>(function AutoTextarea(
  { maxHeight = 320, minHeight, value, style, onChange, ...rest },
  forwardedRef
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)

  // Fusionne le ref interne (mesure) et le ref transmis par l'appelant.
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef]
  )

  // Re-mesure à chaque changement de contenu (frappe locale ou valeur distante).
  useLayoutEffect(() => {
    if (innerRef.current) resizeTextarea(innerRef.current, maxHeight, minHeight)
  }, [value, maxHeight, minHeight])

  return (
    <textarea
      {...rest}
      ref={setRef}
      value={value}
      onChange={(event) => {
        resizeTextarea(event.currentTarget, maxHeight, minHeight)
        onChange?.(event)
      }}
      style={{ resize: 'none', ...style }}
    />
  )
})
