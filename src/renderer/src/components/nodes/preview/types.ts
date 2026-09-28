/**
 * §R2 v1.9 (aperçu) — contrat des composants d'aperçu des nouveaux types de fichiers
 * (bureautique, audio/vidéo, code) : props communes au nœud (FileNode) et à la
 * visionneuse (FileViewer). Les octets viennent de la data-URL COMPLÈTE fournie par
 * useFileSource (phase « ready ») : `decodeBase64(dataUrlPayload(dataUrl), maxBytes)`.
 */
import type { ReactNode } from 'react'
import type { FilePreviewKind } from '@/lib/filePreview'

/** Fichier prêt à prévisualiser (toujours complet : phase « ready »). */
export interface FilePreviewSource {
  /** Type détecté : 'office' | 'audio' | 'video' | 'code' pour ces composants. */
  kind: FilePreviewKind
  /** Clé de cache stable (hash de contenu identique chez tous les pairs) ; null =
   * contenu inline hérité → utiliser previewCacheKey(cacheKey, dataUrl). */
  cacheKey: string | null
  /** data-URL base64 complète du fichier (jamais tronquée). */
  dataUrl: string
  /** Nom affiché (titre du nœud). */
  name: string
  /** Extension de détection (previewExtension : minuscules, sans point ;
   * 'dockerfile' / 'makefile' / 'env' pour les noms sans extension). */
  ext: string
  /** MIME déclaré, normalisé (peut être vide ou application/octet-stream). */
  mime: string
  /** Taille binaire (octets). */
  bytes: number
}

/** Informations que l'aperçu du nœud remonte au pied de carte. */
export interface NodePreviewInfo {
  /** Complément de méta (ex. « 12 diapositives », « 3:24 ») ajouté après le type. */
  meta?: string
  /** Vignette (data: URL png/jpeg) affichée en carte compacte à la place de l'icône. */
  thumbnail?: string
}

/** Props d'un aperçu DANS le nœud. */
export interface NodePreviewProps extends FilePreviewSource {
  /** Carte compacte (hauteur < FILE_NODE_COMPACT_HEIGHT) : ne rien afficher (return
   * null), seulement remonter onInfo si utile (ex. vignette). */
  compact: boolean
  /** Rendu générique (icône + type) à afficher tant qu'il n'y a pas mieux ou en cas d'échec. */
  fallback: ReactNode
  /** Remonter méta/vignette (null pour effacer). Référence stable. */
  onInfo: (info: NodePreviewInfo | null) => void
}

/** Zoom de la visionneuse : 'fit' (ajusté) ou facteur (1 = 100 %). */
export type ViewerZoom = 'fit' | number

/** Props d'un corps de visionneuse (modale plein écran). */
export interface ViewerBodyProps extends FilePreviewSource {
  /** Zoom demandé (boutons −/+, Ctrl+molette, 0 = ajusté) — ignoré par les médias. */
  zoom: ViewerZoom
  /** Facteur réellement appliqué (affiché en % dans la barre). Référence stable. */
  onZoomResolved: (zoom: number) => void
  /** Complément de méta dans l'en-tête (ex. « 3 feuilles », « UTF-8 », durée) ; null = rien. */
  onMeta: (meta: string | null) => void
  /** Enregistrer le fichier (bouton de repli). */
  onSave: () => void
  /** Rendu générique « aperçu indisponible + Enregistrer ». */
  fallback: ReactNode
}
