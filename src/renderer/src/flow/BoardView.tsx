/**
 * Vue tableau : liaison React Flow ↔ Yjs.
 *
 * Principe : React Flow est entièrement « contrôlé » — les nœuds/connexions
 * affichés sont TOUJOURS dérivés du document Yjs (source de vérité partagée),
 * enrichis d'états éphémères locaux (sélection, filtres, recherche, export).
 * Les interactions écrivent dans Yjs, dont l'observation re-rend la vue —
 * localement comme chez les pairs.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement
} from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type EdgeChange,
  type NodeChange
} from '@xyflow/react'
import { PenLine } from 'lucide-react'
import type {
  AccessMode,
  BoardEdgeData,
  BoardNodeData,
  EdgeAnchor,
  EdgeWaypoint,
  ElementStatus,
  EntityStyle,
  EntityType,
  NodeKind,
  PresenceUser,
  UserProfile
} from '@/types'
import { formatNumber, t } from '@/i18n'
import { colorHex } from '@/lib/colors'
import { AUTO_HEIGHT_KINDS } from '@/lib/nodeStyle'
import { resolveSourceAttachments } from '@/lib/entities'
import { TAXONOMY_CATEGORIES, taxonomyType, type CategoryId } from '@/lib/taxonomy'
import { customTypeMap, resolveTypeLabel } from '@/lib/entityTypes'
import { relationLabelKey } from '@/lib/relations'
import { findValueMatches } from '@/lib/matching'
import { makeMatcher } from '@/lib/search'
import {
  buildClip,
  clipBounds,
  detectPastedText,
  parseClip,
  remapClip,
  serializeClip,
  singleImageDataUrl,
  type ClipData,
  type ClipFile
} from '@/lib/clipboard'
// §1 v1.9 (copie d'image) : sortir une image du tableau (presse-papiers, enregistrer).
import {
  clipboardChordOf,
  copyImageToClipboard,
  imageCopyTarget,
  imageKeyAction,
  type ImageCopyTarget,
  isLastCopiedImage,
  lastImageCopyId,
  saveImageAs
} from '@/lib/imageClipboard'
import type { LinkPresetDef } from '@/lib/linkPresets'
import { newId } from '@/lib/id'
import {
  edgeColumns,
  entityColumns,
  exportEdgesCsvColumns,
  exportEntitiesCsvColumns,
  type CsvColumn
} from '@/lib/csvExport'
import type { CsvDelimiter } from '@/lib/csv'
import { CsvImportDialog } from '@/components/board/CsvImportDialog'
import { CsvExportDialog } from '@/components/board/CsvExportDialog'
import { TimelinePanel } from '@/components/board/TimelinePanel'
import type { AddTiming } from '@/lib/timeline'
import { BOARD_IMAGE_PROFILE, initialImageNodeSize, processImage } from '@/lib/image'
import {
  countUnexportableEntityImages,
  exportBoardData,
  serializeTrace
} from '@/lib/serialization'
import { buildSourceReport } from '@/lib/sourceReport'
import { renderBoardToPng } from '@/lib/exportPng'
import type { BoardHandle } from '@/sync/BoardDoc'
import {
  retestBoardConnection,
  setLocalCursor,
  setLocalPresence,
  setLocalSelection,
  watchParticipantLimit
} from '@/sync/BoardDoc'
import { hasCompleteFile, migrateInlineImages, readFileStatus, registerFile } from '@/sync/files'
import { installRoleGuard } from '@/sync/roleGuard'
import { publishRekey } from '@/sync/rotation'
import {
  useAllComments,
  useBoardData,
  useBoardMeta,
  useCustomTypes,
  useConnectionStatus,
  useInitialSync,
  useMyRole,
  usePresence,
  useRoles,
  useUndoRedo
} from '@/sync/hooks'
import {
  DEFAULT_SIZES,
  addComment,
  createEdge,
  createEntity,
  createNode,
  createGraph,
  createSource,
  deleteComment,
  deleteEdges,
  deleteNodes,
  duplicateNodes,
  entityTemplateFields,
  excludeParticipant,
  linkToSource,
  makeEntityNode,
  moveNodes,
  resetEdgeRouting,
  reverseEdge,
  setAccessMode,
  setEdgeAnchor,
  setEdgeRouting,
  setBoardTitle,
  setEdgesStatus,
  setEventTiming,
  setNodesStatus,
  setNodeIcon,
  // §2 v1.9 (galerie) : retrait / déplacement / couverture d'une image d'entité.
  editEntityImages,
  setParticipantLimit,
  setParticipantRole,
  transferAdmin,
  updateEdge,
  updateNode,
  // §7 v1.9 : application d'un préréglage de lien (lot, une transaction).
  applyEdgePreset
} from '@/sync/boardOps'
import { useBoards } from '@/store/boards'
import { useToasts } from '@/store/toasts'
import { useShortcuts, bindingToActionMap } from '@/store/shortcuts'
import { bindingFromEvent } from '@/lib/shortcuts'
import { logSync } from '@/store/syncLog'
import { nodeTypes } from '@/components/nodes'
import { edgeTypes } from '@/components/edges'
import { TopBar } from '@/components/board/TopBar'
import { Toolbar } from '@/components/board/Toolbar'
import { DiagnosticsPanel } from '@/components/board/DiagnosticsPanel'
import { ShareDialog } from '@/components/board/ShareDialog'
import { SearchBar } from '@/components/board/SearchBar'
import { FilterBar } from '@/components/board/FilterBar'
import { SidePanel } from '@/components/board/SidePanel'
import { SourcesPanel } from '@/components/board/SourcesPanel'
import { LegendPanel } from '@/components/board/LegendPanel'
import { EntityPicker, CODE_BLOCK_PICK } from '@/components/board/EntityPicker'
import { SyncOverlay } from '@/components/board/SyncOverlay'
import { BoardMiniMap } from '@/components/board/BoardMiniMap'
import { EdgeToolbar } from '@/components/board/EdgeToolbar'
import { NodeToolbar } from '@/components/board/NodeToolbar'
import { CursorsOverlay } from '@/components/board/CursorsOverlay'
import { BoardContext, type BoardContextValue } from './BoardContext'
import { RouteDrawOverlay } from './RouteDrawOverlay'
import { ZoomCompensator } from './ZoomCompensator'
import type { CosintFlowEdge, CosintFlowNode } from './flowTypes'
import { AddNodeMenu, type AddSelection } from './AddNodeMenu'
import { EdgeContextMenu } from './EdgeContextMenu'
import { EdgePresetChooser } from './EdgePresetChooser'
import { LinkPresetDialog } from '@/components/board/LinkPresetDialog'
import { SelectionContextMenu } from './SelectionContextMenu'
// §2 v1.9 (galerie) : images attachées aux entités (ajout, dépôt sur le nœud, visionneuse).
import { attachEntityImageFiles, entityIdAtPoint, pickAndAttachEntityImages } from './entityImageActions'
import { entityImageFileRefs, isInlineImageRef, pruneUnavailableImages } from '@/lib/entityImages'
import { EntityLightbox } from '@/components/board/EntityLightbox'
// §5 v1.9 (aperçu) : aperçu des fichiers (taille initiale selon le type, visionneuse).
import { detectPreviewKind, fileGridPosition, initialFileNodeSize } from '@/lib/filePreview'
import { FileViewer } from '@/components/board/FileViewer'
import './canvas.css'

/**
 * Presse-papiers INTERNE du canvas (§2 v1.7). Variable de module : elle SURVIT au
 * remontage de BoardView (changement de tableau) → le copier-coller fonctionne d'un
 * tableau à l'autre alors qu'un seul document Yjs est ouvert à la fois. Le presse-
 * papiers SYSTÈME porte la même charge JSON ; on préfère cette copie interne (pleine
 * fidélité, images incluses) quand le nonce correspond. */
let internalClip: ClipData | null = null

/**
 * §1 v1.9 (copie d'image) : dernière copie d'une IMAGE SEULE. Le presse-papiers système
 * ne porte alors QUE le bitmap (aucun JSON, pour que Word/Paint/une messagerie collent
 * bien l'image) ; au recollage DANS COSINT, si l'image collée est bien celle-ci
 * (empreinte), on recrée le nœud en pleine fidélité (titre, tags, taille) plutôt qu'un
 * nœud image nu. Variable de module : survit au changement de tableau. */
let lastImageClip: { copyId: number; clip: ClipData } | null = null

/** §1 v1.9 : instant de la dernière copie d'image lancée au CLAVIER — ignore un éventuel
 *  évènement `copy`/`cut` redondant émis pour le même geste (menu natif). */
let lastKeyboardImageCopyAt = 0
/** Fenêtre (ms) pendant laquelle un évènement `copy`/`cut` suivant la touche est ignoré. */
const KEYBOARD_COPY_DEDUP_MS = 600

/** Budget d'octets pour embarquer les data-URL d'images dans une copie (§2). */
const CLIP_FILE_BUDGET = 4 * 1024 * 1024

/** §5 v1.9 : taille binaire maximale d'un fichier importé (25 Mo) — au-delà, refus
 *  poli, pour garder le document et la synchro P2P sains (chunks bornés). */
const FILE_HARD_LIMIT = 25 * 1024 * 1024

/** Lit un fichier en data-URL base64 (import de fichier, §5 v1.9). */
function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Convertit le profil local en identité de présence diffusée aux pairs (§5/§7). */
export function profileToPresence(profile: UserProfile): PresenceUser {
  return {
    id: profile.userId,
    name: profile.pseudo,
    color: profile.colorHex,
    avatar: { type: profile.avatarType, value: profile.avatarValue },
    role: profile.role,
    status: profile.status
  }
}

/** Signal d'action de menu relayé par App (export/import). */
export type BoardMenuSignal =
  | { action: 'export-trace' | 'export-png' | 'export-csv'; seq: number }
  | { action: 'import-csv'; seq: number; csvText: string; encoding?: string }

export interface BoardViewProps {
  handle: BoardHandle
  profile: UserProfile
  /** true si le tableau vient d'être rejoint par code (→ contrôle de la limite). */
  isJoining: boolean
  /** Signal d'action de menu relayé par App (export/import CSV). */
  menuSignal: BoardMenuSignal | null
  /** §1 v1.7 : importe un graphe CSV construit dans un NOUVEAU tableau (via App). */
  onImportCsvNewBoard: (nodes: BoardNodeData[], edges: BoardEdgeData[], title: string) => void
  onBack: () => void
  onOpenSettings: () => void
  /** §5 : génère un code de partage (choix du mode) et ouvre la connexion. */
  onGenerateShare: (mode: AccessMode) => void
  /** §5 : révoque le code (déconnecte les participants, repasse en solo). */
  onRevokeShare: () => void
  /** §5 : régénère un nouveau code (rotation du secret). */
  onRegenerateShare: (mode: AccessMode) => void
}

export function BoardView(props: BoardViewProps): ReactElement {
  return (
    <ReactFlowProvider>
      <BoardCanvas {...props} />
    </ReactFlowProvider>
  )
}

/** Côté d'ancrage automatique d'une extrémité (§1) : la poignée du nœud tournée
 *  vers le point visé (l'autre nœud, ou le premier/dernier point de passage). */
function autoAnchorSide(fromX: number, fromY: number, toX: number, toY: number): 't' | 'b' | 'l' | 'r' {
  const dx = toX - fromX
  const dy = toY - fromY
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'r' : 'l'
  return dy >= 0 ? 'b' : 't'
}

/** Distance d'un point (px,py) au segment [a,b] (§1 : choix du segment le plus
 *  proche pour insérer un point de passage au double-clic). */
function distanceToSegment(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const tRaw = lenSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lenSq
  const t = Math.max(0, Math.min(1, tRaw))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** Nettoie un titre pour en faire un nom de fichier proposé. */
function toFileName(title: string, extension: string): string {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'tableau'
  return `${base}.${extension}`
}

function BoardCanvas({
  handle,
  profile,
  isJoining,
  menuSignal,
  onImportCsvNewBoard,
  onBack,
  onOpenSettings,
  onGenerateShare,
  onRevokeShare,
  onRegenerateShare
}: BoardViewProps): ReactElement {
  const reactFlow = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const author = profile.pseudo

  const { nodes: boardNodes, edges: boardEdges } = useBoardData(handle)
  const customTypes = useCustomTypes(handle)
  const customTypeMapValue = useMemo(() => customTypeMap(customTypes), [customTypes])
  const meta = useBoardMeta(handle)
  const others = usePresence(handle)
  const allComments = useAllComments(handle)
  const connection = useConnectionStatus(handle)
  // §1a : synchronisation initiale d'un nouvel arrivant (overlay tant que l'état
  // complet n'est pas reçu). Actif seulement pour une jonction connectée.
  const initialSync = useInitialSync(handle, isJoining)
  const { undo, redo, canUndo, canRedo } = useUndoRedo(handle)
  const pushToast = useToasts((state) => state.push)
  const touchBoard = useBoards((state) => state.touch)

  // ——— Rôle et permissions (§6) ———
  const role = useMyRole(handle, profile.userId)
  const roles = useRoles(handle)
  const canEdit = role !== 'visitor'
  const canManageSharing = role === 'admin'
  const solo = handle.shareCode === null && !handle.provider

  // Liste des participants (soi + pairs en ligne) avec leur rôle effectif, pour
  // le panneau Participants (§6). Les identités hors ligne ne sont pas listées.
  const participants = useMemo(() => {
    const roleOf = (userId: string): 'admin' | 'editor' | 'visitor' => {
      if (userId !== '' && userId === meta.adminId) return 'admin'
      const explicit = roles[userId]
      return explicit === 'visitor' || explicit === 'editor' ? explicit : 'editor'
    }
    const seen = new Set<string>()
    const list: Array<{
      userId: string
      name: string
      color: string
      avatar: PresenceUser['avatar']
      role: 'admin' | 'editor' | 'visitor'
      online: boolean
    }> = []
    const add = (userId: string, name: string, color: string, avatar: PresenceUser['avatar']): void => {
      if (userId === '' || seen.has(userId)) return
      seen.add(userId)
      list.push({ userId, name, color, avatar, role: roleOf(userId), online: true })
    }
    add(profile.userId, profile.pseudo, profile.colorHex, {
      type: profile.avatarType,
      value: profile.avatarValue
    })
    for (const other of others) add(other.user.id, other.user.name, other.user.color, other.user.avatar)
    return list
  }, [others, roles, meta.adminId, profile])

  // Filtre de réception (§6) : révoque les modifications distantes non autorisées.
  // Installé uniquement quand le tableau est connecté (provider présent).
  useEffect(() => installRoleGuard(handle), [handle])

  // Notification discrète du changement de rôle à chaud (§6). Le premier rôle
  // observé ne déclenche rien (montage) ; seuls les changements le font.
  const previousRole = useRef(role)
  useEffect(() => {
    if (previousRole.current !== role) {
      previousRole.current = role
      pushToast(t('role.changed', { role: t(`role.${role}`) }), 'info')
    }
  }, [role, pushToast])

  // ——— États éphémères locaux ———
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(new Set())
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(new Set())
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  // §3 v1.7 : options de recherche (accents toujours ignorés ; casse et mot entier
  // désactivés par défaut ; filtre facultatif par catégorie d'entité).
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false)
  const [searchWholeWord, setSearchWholeWord] = useState(false)
  const [searchCategory, setSearchCategory] = useState<CategoryId | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [activeColors, setActiveColors] = useState<string[]>([])
  const [activeCategories, setActiveCategories] = useState<CategoryId[]>([])
  const [activeEntityTypes, setActiveEntityTypes] = useState<string[]>([])
  // §3 : filtre par badge de statut (nœuds ET liens).
  const [activeStatuses, setActiveStatuses] = useState<ElementStatus[]>([])
  const [shareOpen, setShareOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  // Position (coordonnées canvas) où créer l'entité choisie dans le sélecteur ;
  // null = sélecteur fermé.
  const [entityPickerAt, setEntityPickerAt] = useState<{ x: number; y: number } | null>(null)
  // Menu contextuel d'un lien (clic droit, §1) ; null = fermé.
  const [edgeMenu, setEdgeMenu] = useState<{
    screenX: number
    screenY: number
    edgeId: string
  } | null>(null)
  // §7 v1.9 : sélecteur de préréglage de lien, ouvert juste après avoir relié deux
  // entités (Automatique + préréglages nommés) ; null = fermé.
  const [presetChooser, setPresetChooser] = useState<{
    screenX: number
    screenY: number
    edgeId: string
  } | null>(null)
  // §1 v1.7.1 : mode « Dessiner le tracé » d'un lien — null = inactif.
  // Étape 'source' : choix du côté de départ (pastilles sur le nœud source) ;
  // étape 'path' : pose des points de passage, puis choix du côté d'arrivée.
  // Rien n'est écrit dans le document avant la fin (Échap = annulation totale).
  const [routeDraw, setRouteDraw] = useState<{
    edgeId: string
    step: 'source' | 'path'
    sourceAnchor: EdgeAnchor | null
    waypoints: EdgeWaypoint[]
  } | null>(null)
  const routeDrawRef = useRef(routeDraw)
  routeDrawRef.current = routeDraw
  const [exporting, setExporting] = useState(false)
  const [addMenu, setAddMenu] = useState<{
    screenX: number
    screenY: number
    flowX: number
    flowY: number
  } | null>(null)
  // Menu contextuel de la sélection (clic droit → Supprimer, §6bis) ; null = fermé.
  const [selectionMenu, setSelectionMenu] = useState<{
    screenX: number
    screenY: number
    count: number
    /** §2 v1.9 (galerie) : entité visée par un clic droit sur UNE entité (« Ajouter une image… »). */
    entityId?: string
    /** §1 v1.9 (copie d'image) : nœud image visé par un clic droit (Copier / Enregistrer). */
    imageNodeId?: string
  } | null>(null)
  // Presse-style de la pipette (§4) : style copié en attente d'application.
  const [copiedStyle, setCopiedStyle] = useState<EntityStyle | null>(null)
  // §1 v1.7 : texte CSV à importer (assistant ouvert) ; null = fermé.
  const [csvImport, setCsvImport] = useState<{ text: string; encoding?: string } | null>(null)
  // §4 v1.8 : dialogue de choix des colonnes pour l'export CSV (entités ou liens).
  const [csvExport, setCsvExport] = useState<
    | { kind: 'entities'; columns: Array<CsvColumn<BoardNodeData>> }
    | { kind: 'edges'; columns: Array<CsvColumn<BoardEdgeData>> }
    | null
  >(null)
  // §4 v1.7 : vue courante — canvas ou chronologie (frise).
  const [view, setView] = useState<'canvas' | 'timeline'>('canvas')

  // Id du nœud tout juste créé, pour signaler s'il naît masqué par un filtre actif.
  const justCreatedId = useRef<string | null>(null)
  const boardNodesRef = useRef(boardNodes)
  boardNodesRef.current = boardNodes
  const boardEdgesRef = useRef(boardEdges)
  boardEdgesRef.current = boardEdges
  // §2 v1.7 : refs pour le copier-coller (listeners montés une fois, lisant l'état à
  // chaud) — sélection, permission et dernière position écran de la souris.
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  selectedNodeIdsRef.current = selectedNodeIds
  // §1 v1.9 (copie d'image) : copie d'un nœud image désigné — fournie par l'effet
  // presse-papiers (même chemin que Ctrl+C), utilisée par le bouton du nœud et le clic droit.
  const copyImageNodeRef = useRef<((nodeId: string) => void) | null>(null)
  const selectedEdgeIdsRef = useRef(selectedEdgeIds)
  selectedEdgeIdsRef.current = selectedEdgeIds
  const canEditRef = useRef(canEdit)
  canEditRef.current = canEdit
  const lastPointerScreen = useRef<{ x: number; y: number } | null>(null)

  // ——— Présence : identité, sélection, curseur ———
  // L'avatar image n'est JAMAIS diffusé via l'awareness (§1.1 : cela saturait les
  // canaux WebRTC) : on l'enregistre en chunks dans `files` et l'awareness ne
  // porte que son hash. En attendant l'enregistrement, on diffuse les initiales.
  useEffect(() => {
    const presence = profileToPresence(profile)
    // §1b : publie la clé publique éphémère de session dans l'awareness, pour
    // permettre une migration transparente lors d'une rotation de code.
    publishRekey(handle)
    if (presence.avatar.type === 'image' && presence.avatar.value.startsWith('data:image/')) {
      const dataUrl = presence.avatar.value
      setLocalPresence(handle, { ...presence, avatar: { type: 'initials', value: '' } })
      let cancelled = false
      void registerFile(handle, dataUrl).then((hash) => {
        if (!cancelled && hash) {
          setLocalPresence(handle, { ...presence, avatar: { type: 'image', value: hash } })
        }
      })
      return () => {
        cancelled = true
      }
    }
    setLocalPresence(handle, presence)
    return undefined
  }, [handle, profile])

  useEffect(() => {
    setLocalSelection(handle, [...selectedNodeIds])
  }, [handle, selectedNodeIds])

  // Purge des sélections dont l'élément a disparu du doc (suppression locale ou
  // par un pair) : React Flow n'émet pas de « désélection » pour un nœud retiré
  // des props, ce qui laisserait des ids fantômes dans les sets. On ne remplace
  // le set que si un id a réellement disparu (préserve l'identité → pas de
  // re-render ni de re-diffusion d'awareness inutiles).
  useEffect(() => {
    const nodeIds = new Set(boardNodes.map((node) => node.id))
    setSelectedNodeIds((prev) =>
      [...prev].every((id) => nodeIds.has(id))
        ? prev
        : new Set([...prev].filter((id) => nodeIds.has(id)))
    )
  }, [boardNodes])

  useEffect(() => {
    const edgeIds = new Set(boardEdges.map((edge) => edge.id))
    setSelectedEdgeIds((prev) =>
      [...prev].every((id) => edgeIds.has(id))
        ? prev
        : new Set([...prev].filter((id) => edgeIds.has(id)))
    )
  }, [boardEdges])

  // Purge des filtres actifs dont le tag/la couleur a disparu du tableau : sans
  // cela un filtre orphelin masquerait TOUS les nœuds sans moyen de le désactiver.
  useEffect(() => {
    const present = new Set<string>()
    for (const node of boardNodes) for (const tag of node.tags) present.add(tag)
    setActiveTags((prev) =>
      prev.every((tag) => present.has(tag)) ? prev : prev.filter((tag) => present.has(tag))
    )
  }, [boardNodes])

  useEffect(() => {
    const present = new Set(boardNodes.map((node) => node.color))
    setActiveColors((prev) =>
      prev.every((color) => present.has(color)) ? prev : prev.filter((color) => present.has(color))
    )
  }, [boardNodes])

  // Purge des filtres catégorie/type orphelins (§2).
  useEffect(() => {
    const cats = new Set<CategoryId>()
    const types = new Set<string>()
    for (const node of boardNodes) {
      if (node.kind !== 'entity' || !node.entityType) continue
      types.add(node.entityType)
      const category = taxonomyType(node.entityType)?.category
      if (category) cats.add(category)
    }
    setActiveCategories((prev) =>
      prev.every((cat) => cats.has(cat)) ? prev : prev.filter((cat) => cats.has(cat))
    )
    setActiveEntityTypes((prev) =>
      prev.every((type) => types.has(type)) ? prev : prev.filter((type) => types.has(type))
    )
  }, [boardNodes])

  // Limite de participants réglable (§1e/§6) : vérification à la CONNEXION
  // effective (en plus de l'approbation, App). Si, à l'arrivée, le tableau est
  // sur-occupé, le nouvel arrivant se retire proprement (déconnexion complète,
  // jamais d'état à moitié connecté) avec un message clair.
  useEffect(() => {
    if (!isJoining) return
    return watchParticipantLimit(handle, () => {
      const limit = meta.participantLimit
      logSync('warn', `Tableau complet (${limit}/${limit}) — connexion refusée.`)
      pushToast(t('board.fullHard', { count: limit, max: limit }), 'error')
      onBack()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, isJoining])

  // Le titre reçu des pairs alimente le registre local des tableaux récents.
  useEffect(() => {
    if (meta.title !== '') touchBoard(handle.boardId, { title: meta.title })
  }, [meta.title, handle.boardId, touchBoard])

  // ——— Filtres (§2/§3/§5) : masquer les nœuds hors tag / couleur / catégorie /
  // type / statut ———
  const hiddenIds = useMemo(() => {
    const noFilter =
      activeTags.length === 0 &&
      activeColors.length === 0 &&
      activeCategories.length === 0 &&
      activeEntityTypes.length === 0 &&
      activeStatuses.length === 0
    if (noFilter) return new Set<string>()
    const hidden = new Set<string>()
    for (const node of boardNodes) {
      const tagOk = activeTags.length === 0 || node.tags.some((tag) => activeTags.includes(tag))
      const colorOk = activeColors.length === 0 || activeColors.includes(node.color)
      // Catégorie/type : ne concernent que les entités ; un nœud non-entité échoue
      // ces dimensions dès qu'elles sont actives (on se concentre sur les entités).
      const entityCat =
        node.kind === 'entity' && node.entityType
          ? taxonomyType(node.entityType)?.category
          : undefined
      const categoryOk =
        activeCategories.length === 0 ||
        (entityCat !== undefined && activeCategories.includes(entityCat))
      const typeOk =
        activeEntityTypes.length === 0 ||
        (node.kind === 'entity' && !!node.entityType && activeEntityTypes.includes(node.entityType))
      // §3 : filtre par badge de statut (absent = 'none').
      const statusOk =
        activeStatuses.length === 0 || activeStatuses.includes(node.status ?? 'none')
      if (!tagOk || !colorOk || !categoryOk || !typeOk || !statusOk) hidden.add(node.id)
    }
    return hidden
  }, [boardNodes, activeTags, activeColors, activeCategories, activeEntityTypes, activeStatuses])

  // §3 : liens masqués par le filtre de statut (les liens n'ont pas de tag/couleur).
  const hiddenEdgeIds = useMemo(() => {
    if (activeStatuses.length === 0) return new Set<string>()
    const hidden = new Set<string>()
    for (const edge of boardEdges) {
      if (!activeStatuses.includes(edge.status ?? 'none')) hidden.add(edge.id)
    }
    return hidden
  }, [boardEdges, activeStatuses])

  // §3 : compteur par statut (nœuds + liens confondus), pour la barre de filtres.
  const statusCounts = useMemo(() => {
    const counts: Record<ElementStatus, number> = {
      none: 0,
      confirmed: 0,
      issue: 0,
      false_positive: 0,
      question: 0,
      stop: 0,
      onhold: 0
    }
    for (const node of boardNodes) counts[node.status ?? 'none']++
    for (const edge of boardEdges) counts[edge.status ?? 'none']++
    return counts
  }, [boardNodes, boardEdges])

  // Un nœud créé pendant qu'un filtre est actif peut naître masqué (la création
  // semblerait avoir échoué) : on le signale une fois par un toast.
  useEffect(() => {
    const id = justCreatedId.current
    justCreatedId.current = null
    if (id && hiddenIds.has(id)) pushToast(t('filter.createdHidden'), 'info')
  }, [hiddenIds, pushToast])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const node of boardNodes) for (const tag of node.tags) tags.add(tag)
    return [...tags].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [boardNodes])

  // Couleurs distinctes présentes sur le tableau (filtre par couleur libre, §5).
  const allColors = useMemo(() => {
    const colors = new Set<string>()
    for (const node of boardNodes) colors.add(node.color)
    return [...colors].sort()
  }, [boardNodes])

  // Catégories et types d'entité présents (filtres §2).
  const allCategories = useMemo(() => {
    const set = new Set<CategoryId>()
    for (const node of boardNodes) {
      if (node.kind !== 'entity' || !node.entityType) continue
      const category = taxonomyType(node.entityType)?.category
      if (category) set.add(category)
    }
    return TAXONOMY_CATEGORIES.filter((cat) => set.has(cat.id)).map((cat) => cat.id)
  }, [boardNodes])

  const allEntityTypes = useMemo(() => {
    const set = new Set<string>()
    for (const node of boardNodes) {
      if (node.kind === 'entity' && node.entityType) set.add(node.entityType)
    }
    return [...set].sort((a, b) =>
      resolveTypeLabel(a, customTypeMapValue).localeCompare(resolveTypeLabel(b, customTypeMapValue), 'fr')
    )
  }, [boardNodes, customTypeMapValue])

  // ——— Sources (§4) : liste + nombre d'éléments rattachés par source ———
  const sources = useMemo(
    () => boardNodes.filter((node) => node.kind === 'source'),
    [boardNodes]
  )
  const attachedCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [sourceId, items] of resolveSourceAttachments(boardNodes, boardEdges)) {
      counts[sourceId] = items.length
    }
    return counts
  }, [boardNodes, boardEdges])

  // ——— Voisinage (§2) : quand un seul nœud est sélectionné, on met en avant ses
  // liens et ses voisins directs, et on estompe le reste. ———
  const focusNodeId = selectedNodeIds.size === 1 ? [...selectedNodeIds][0] : null
  const { neighborIds, incidentEdgeIds } = useMemo(() => {
    if (!focusNodeId) return { neighborIds: null as Set<string> | null, incidentEdgeIds: new Set<string>() }
    const neighbors = new Set<string>([focusNodeId])
    const edges = new Set<string>()
    for (const edge of boardEdges) {
      if (edge.source === focusNodeId) {
        neighbors.add(edge.target)
        edges.add(edge.id)
      } else if (edge.target === focusNodeId) {
        neighbors.add(edge.source)
        edges.add(edge.id)
      }
    }
    return { neighborIds: neighbors, incidentEdgeIds: edges }
  }, [focusNodeId, boardEdges])

  // Index des commentaires par nœud (pour la recherche plein texte, §6).
  const commentsByNode = useMemo(() => {
    const map = new Map<string, string>()
    for (const comment of allComments) {
      map.set(comment.nodeId, `${map.get(comment.nodeId) ?? ''} ${comment.text}`)
    }
    return map
  }, [allComments])

  // ——— Recherche plein texte (§6, enrichie §3 v1.7) ———
  // Résultats = nœuds ET liens correspondants, dans l'ordre du tableau (nœuds puis
  // liens). Insensible aux accents et (par défaut) à la casse ; options « sensible à
  // la casse » / « mot entier » / « filtre par catégorie d'entité ».
  const searchResults = useMemo<Array<{ type: 'node' | 'edge'; id: string }>>(() => {
    if (!searchOpen) return []
    const match = makeMatcher(query, {
      caseSensitive: searchCaseSensitive,
      wholeWord: searchWholeWord
    })
    if (!match) return []
    const hits: Array<{ type: 'node' | 'edge'; id: string }> = []
    for (const node of boardNodes) {
      if (hiddenIds.has(node.id)) continue
      const category =
        node.kind === 'entity' && node.entityType
          ? taxonomyType(node.entityType)?.category
          : undefined
      // Filtre par catégorie : ne retient que les entités de la catégorie choisie.
      if (searchCategory !== null && category !== searchCategory) continue
      const comments = commentsByNode.get(node.id) ?? ''
      // Le contenu (hash/base64) d'une image ou d'un fichier n'est pas cherché (faux
      // positifs) ; seuls titre, tags et commentaires le sont pour ces types.
      const base =
        node.kind === 'image' || node.kind === 'file'
          ? `${node.title} ${node.tags.join(' ')}`
          : `${node.content} ${node.title} ${node.tags.join(' ')}`
      // Champs de fiche non vides (§3) : seuls les champs renseignés sont indexés,
      // pour ne pas faire correspondre le libellé d'un gabarit (ex. « Email » vide).
      const fieldsText = node.fields
        .filter((field) => field.value.trim() !== '')
        .map((field) => `${field.label} ${field.value}`)
        .join(' ')
      // Métadonnées de type/source : libellé traduit du type d'entité ; type,
      // fiabilité et crédibilité d'une source (nom de la source = title/content déjà).
      let extra = ''
      if (node.kind === 'entity' && node.entityType) extra = resolveTypeLabel(node.entityType, customTypeMapValue)
      else if (node.kind === 'source') {
        extra = `${t(`sourceType.${node.sourceType}` as never)} ${node.reliability ?? ''} ${node.credibility ?? ''}`
      }
      if (match(`${base} ${fieldsText} ${comments} ${extra}`)) hits.push({ type: 'node', id: node.id })
    }
    // Liens : indexés seulement hors filtre de catégorie (un lien n'a pas de type
    // d'entité). On cherche le libellé libre ET le type de relation traduit.
    if (searchCategory === null) {
      for (const edge of boardEdges) {
        if (
          hiddenIds.has(edge.source) ||
          hiddenIds.has(edge.target) ||
          hiddenEdgeIds.has(edge.id)
        ) {
          continue
        }
        const relKey = edge.relationType !== '' ? relationLabelKey(edge.relationType) : null
        const relText = relKey ? t(relKey) : edge.relationType
        if (match(`${edge.label} ${relText}`)) hits.push({ type: 'edge', id: edge.id })
      }
    }
    return hits
  }, [
    boardNodes,
    boardEdges,
    query,
    searchOpen,
    searchCaseSensitive,
    searchWholeWord,
    searchCategory,
    hiddenIds,
    hiddenEdgeIds,
    commentsByNode
  ])

  // Reclampe l'index quand le nombre de résultats rétrécit (filtre/tick) — évite un
  // « Suivant » qui saute ou un « Précédent » bloqué depuis un index périmé.
  useEffect(() => setSearchIndex(0), [query, searchCaseSensitive, searchWholeWord, searchCategory])
  useEffect(() => {
    if (searchIndex > 0 && searchIndex >= searchResults.length) setSearchIndex(0)
  }, [searchResults.length, searchIndex])
  const safeIndex = searchResults.length === 0 ? 0 : Math.min(searchIndex, searchResults.length - 1)
  const currentMatch = searchResults.length > 0 ? searchResults[safeIndex] : null
  // Clé STABLE du résultat courant : le centrage ne doit PAS se re-déclencher à chaque
  // tick Yjs (sinon la caméra est détournée pendant un drag / une édition d'un pair) —
  // seulement quand la cible change réellement.
  const currentMatchKey = currentMatch ? `${currentMatch.type}:${currentMatch.id}` : null

  // Centrage automatique sur le résultat courant (nœud → son centre ; lien → milieu
  // des centres des deux extrémités). Ne dézoome jamais sous le zoom courant.
  useEffect(() => {
    if (!currentMatch) return
    if (currentMatch.type === 'node') {
      const node = boardNodesRef.current.find((candidate) => candidate.id === currentMatch.id)
      if (!node) return
      reactFlow.setCenter(node.x + node.width / 2, node.y + node.height / 2, {
        zoom: Math.max(reactFlow.getZoom(), 0.85),
        duration: 250
      })
    } else {
      const edge = boardEdgesRef.current.find((candidate) => candidate.id === currentMatch.id)
      if (!edge) return
      const s = nodeCentersRef.current.get(edge.source)
      const target = nodeCentersRef.current.get(edge.target)
      if (!s || !target) return
      reactFlow.setCenter((s.cx + target.cx) / 2, (s.cy + target.cy) / 2, {
        zoom: Math.max(reactFlow.getZoom(), 0.85),
        duration: 250
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatchKey, reactFlow])

  // ——— Sélections des autres participants (anneau à leur couleur, §5) ———
  // Clé de contenu : ne dépend QUE des sélections/couleurs, pas des curseurs —
  // ainsi remoteSelection (et donc flowNodes) reste stable quand seuls les
  // curseurs distants bougent, évitant de reconstruire tous les nœuds à 20 Hz.
  const selectionSignature = others
    .map((other) => `${other.clientId}:${other.user.color}:${other.selection.join(',')}`)
    .join('|')
  const remoteSelection = useMemo(() => {
    const map = new Map<string, string>()
    for (const other of others) {
      for (const id of other.selection) {
        if (!map.has(id)) map.set(id, other.user.color)
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSignature])

  // ——— Dérivation des nœuds/connexions React Flow ———
  const searchNodeSet = useMemo(
    () => new Set(searchResults.filter((hit) => hit.type === 'node').map((hit) => hit.id)),
    [searchResults]
  )
  const searchEdgeSet = useMemo(
    () => new Set(searchResults.filter((hit) => hit.type === 'edge').map((hit) => hit.id)),
    [searchResults]
  )

  const flowNodes = useMemo<CosintFlowNode[]>(
    () =>
      boardNodes.map((board) => {
        // À l'export PNG, aucun décor éphémère (anneaux de sélection distante,
        // surlignages de recherche) ne doit être incrusté dans l'image.
        const remoteColor = exporting ? undefined : remoteSelection.get(board.id)
        const classes: string[] = []
        if (remoteColor) classes.push('fl-remote-selected')
        if (!exporting && searchNodeSet.has(board.id)) {
          const isCurrent = currentMatch?.type === 'node' && currentMatch.id === board.id
          classes.push(isCurrent ? 'fl-search-current' : 'fl-search-hit')
        }
        // Mise en retrait des nœuds hors voisinage du nœud focalisé (§2).
        if (!exporting && neighborIds && !neighborIds.has(board.id)) {
          classes.push('fl-dimmed')
        }
        // Hauteur pilotée par le contenu (React Flow mesure) — tout le contenu
        // apparaît sans être rogné (§6bis v1.4, généralisé aux notes en §4 v1.6).
        const autoHeight = AUTO_HEIGHT_KINDS.has(board.kind)
        // §1d : on RÉINJECTE les dimensions déjà mesurées par React Flow. Sans
        // cela, comme `useBoardData` reconstruit tout le tableau à chaque tick
        // Yjs, chaque objet nœud repart sans `measured` → React Flow réinitialise
        // ses `handleBounds` et masque les nœuds auto-hauteur (visibility:hidden),
        // faisant DISPARAÎTRE liens et nœuds jusqu'au redémarrage. En reportant
        // `measured`, les poignées et l'affichage restent stables.
        //
        // On lit la mesure sur le nœud INTERNE (`getInternalNode`) : `getNode`
        // renverrait le userNode qu'on a nous-mêmes passé (sans `measured` en mode
        // contrôlé) — le report serait alors un no-op.
        const measured = reactFlow.getInternalNode(board.id)?.measured
        return {
          id: board.id,
          type: board.kind,
          position: { x: board.x, y: board.y },
          width: board.width,
          height: autoHeight ? undefined : board.height,
          ...(measured ? { measured } : {}),
          data: { board },
          selected: !exporting && selectedNodeIds.has(board.id),
          hidden: hiddenIds.has(board.id),
          zIndex: board.kind === 'group' ? -10 : 0,
          className: classes.join(' ') || undefined,
          style: remoteColor
            ? ({ '--fl-remote-color': remoteColor } as CSSProperties)
            : undefined
        }
      }),
    [
      boardNodes,
      selectedNodeIds,
      hiddenIds,
      remoteSelection,
      searchNodeSet,
      currentMatch,
      exporting,
      neighborIds,
      reactFlow
    ]
  )

  // Centre de chaque nœud, pour ancrer les liens sur la poignée du côté qui fait
  // face à l'autre nœud (liens « flottants » façon Maltego — §1). Sans cela un
  // lien sans ancre s'accrocherait toujours à la poignée gauche des deux nœuds.
  const nodeCenters = useMemo(() => {
    const centers = new Map<string, { cx: number; cy: number }>()
    for (const node of boardNodes) {
      centers.set(node.id, { cx: node.x + node.width / 2, cy: node.y + node.height / 2 })
    }
    return centers
  }, [boardNodes])
  const nodeCentersRef = useRef(nodeCenters)
  nodeCentersRef.current = nodeCenters

  const flowEdges = useMemo<CosintFlowEdge[]>(
    () =>
      boardEdges.map((board) => {
        const arrow = {
          type: MarkerType.ArrowClosed,
          color: colorHex(board.color),
          width: 16,
          height: 16
        }
        const dimmed = !exporting && neighborIds !== null && !incidentEdgeIds.has(board.id)
        // §3 v1.7 : surlignage des liens correspondant à la recherche.
        const edgeClasses: string[] = []
        if (dimmed) edgeClasses.push('fl-dimmed')
        if (!exporting && searchEdgeSet.has(board.id)) {
          const isCurrent = currentMatch?.type === 'edge' && currentMatch.id === board.id
          edgeClasses.push(isCurrent ? 'fl-search-current' : 'fl-search-hit')
        }
        // Ancres : manuelles (§1 v1.6) si posées, sinon dynamiques (côté tourné vers
        // l'autre nœud — ou vers le premier/dernier point de passage s'il y en a).
        const s = nodeCenters.get(board.source)
        const target = nodeCenters.get(board.target)
        let sourceHandle: string | undefined
        let targetHandle: string | undefined
        if (s && target) {
          const wps = board.waypoints ?? []
          const firstAim = wps.length > 0 ? wps[0] : { x: target.cx, y: target.cy }
          const lastAim = wps.length > 0 ? wps[wps.length - 1] : { x: s.cx, y: s.cy }
          sourceHandle = board.sourceAnchor ?? autoAnchorSide(s.cx, s.cy, firstAim.x, firstAim.y)
          targetHandle = board.targetAnchor ?? autoAnchorSide(target.cx, target.cy, lastAim.x, lastAim.y)
        }
        return {
          id: board.id,
          source: board.source,
          target: board.target,
          sourceHandle,
          targetHandle,
          type: 'cosint' as const,
          data: { board },
          selected: !exporting && selectedEdgeIds.has(board.id),
          hidden:
            hiddenIds.has(board.source) ||
            hiddenIds.has(board.target) ||
            hiddenEdgeIds.has(board.id),
          className: edgeClasses.join(' ') || undefined,
          // Direction (§2) : flèche en fin (single/double), et en tête si double.
          markerEnd: board.direction === 'none' ? undefined : arrow,
          markerStart: board.direction === 'double' ? arrow : undefined
        }
      }),
    [
      boardEdges,
      selectedEdgeIds,
      hiddenIds,
      hiddenEdgeIds,
      exporting,
      neighborIds,
      incidentEdgeIds,
      nodeCenters,
      searchEdgeSet,
      currentMatch
    ]
  )

  // ——— Application des changements React Flow → Yjs ———
  const onNodesChange = useCallback(
    (changes: NodeChange<CosintFlowNode>[]) => {
      const moves: Array<{ id: string; x: number; y: number }> = []
      let nextSelection: Set<string> | null = null
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          moves.push({ id: change.id, x: change.position.x, y: change.position.y })
        } else if (change.type === 'dimensions' && change.dimensions && change.resizing) {
          // Redimensionnement : écriture réservée aux éditeurs/admin (§6).
          if (canEdit) {
            updateNode(
              handle,
              change.id,
              { width: change.dimensions.width, height: change.dimensions.height },
              author
            )
          }
        } else if (change.type === 'select') {
          nextSelection ??= new Set(selectedNodeIds)
          if (change.selected) nextSelection.add(change.id)
          else nextSelection.delete(change.id)
        }
      }
      if (moves.length > 0 && canEdit) moveNodes(handle, moves, author)
      if (nextSelection) setSelectedNodeIds(nextSelection)
    },
    [handle, author, selectedNodeIds, canEdit]
  )

  // ——— §4 : déplacement d'une zone AVEC son contenu (Ctrl+glisser) ———
  // Sans Ctrl, déplacer une zone ne déplace qu'elle. Avec Ctrl maintenu au
  // démarrage du glissement, tous les nœuds dont le CENTRE est dans le rectangle
  // de la zone se déplacent avec elle (recouvrement géométrique). Pas de conflit
  // avec le pan Ctrl+clic (v1.3) : celui-ci ne s'active que sur le FOND vide, pas
  // sur un nœud/zone (onCanvasPointerDown filtre `react-flow__pane`).
  const groupDragRef = useRef<{
    groupId: string
    groupStart: { x: number; y: number }
    children: Array<{ id: string; x: number; y: number }>
  } | null>(null)

  /** Nœuds dont le centre est géométriquement DANS le rectangle d'une zone (§4). */
  const nodesOnZone = useCallback((group: BoardNodeData): BoardNodeData[] => {
    const left = group.x
    const top = group.y
    const right = group.x + group.width
    const bottom = group.y + group.height
    return boardNodesRef.current.filter((node) => {
      if (node.id === group.id || node.kind === 'group') return false
      const cx = node.x + node.width / 2
      const cy = node.y + node.height / 2
      return cx >= left && cx <= right && cy >= top && cy <= bottom
    })
  }, [])

  const onNodeDragStart = useCallback(
    (event: MouseEvent | TouchEvent, node: CosintFlowNode) => {
      if (!canEdit || node.type !== 'group') {
        groupDragRef.current = null
        return
      }
      const grouped = 'ctrlKey' in event && (event.ctrlKey || event.metaKey)
      if (!grouped) {
        groupDragRef.current = null
        return
      }
      const group = boardNodesRef.current.find((candidate) => candidate.id === node.id)
      if (!group) return
      groupDragRef.current = {
        groupId: group.id,
        groupStart: { x: group.x, y: group.y },
        children: nodesOnZone(group).map((child) => ({ id: child.id, x: child.x, y: child.y }))
      }
    },
    [canEdit, nodesOnZone]
  )

  const dragZoneChildren = useCallback(
    (node: CosintFlowNode) => {
      const drag = groupDragRef.current
      if (!drag || node.id !== drag.groupId || drag.children.length === 0) return
      const dx = node.position.x - drag.groupStart.x
      const dy = node.position.y - drag.groupStart.y
      moveNodes(
        handle,
        drag.children.map((child) => ({ id: child.id, x: child.x + dx, y: child.y + dy })),
        author
      )
    },
    [handle, author]
  )

  const onNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: CosintFlowNode) => dragZoneChildren(node),
    [dragZoneChildren]
  )

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: CosintFlowNode) => {
      dragZoneChildren(node)
      groupDragRef.current = null
    },
    [dragZoneChildren]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CosintFlowEdge>[]) => {
      let nextSelection: Set<string> | null = null
      for (const change of changes) {
        if (change.type === 'select') {
          nextSelection ??= new Set(selectedEdgeIds)
          if (change.selected) nextSelection.add(change.id)
          else nextSelection.delete(change.id)
        }
      }
      if (nextSelection) setSelectedEdgeIds(nextSelection)
    },
    [selectedEdgeIds]
  )

  const onConnect = useCallback(
    (connectionParams: Connection) => {
      const { source, target } = connectionParams
      if (!source || !target) return
      // Si l'une des extrémités est une source, le lien devient automatiquement
      // « source de » en pointillé (§4), quel que soit le sens du tracé ; sinon lien
      // standard sélectionné pour choisir sa relation.
      const sourceNode = boardNodesRef.current.find((node) => node.id === source)
      const targetNode = boardNodesRef.current.find((node) => node.id === target)
      let edgeId: string | null
      let isSourceLink = false
      if (sourceNode?.kind === 'source') {
        edgeId = linkToSource(handle, target, source, author)
        isSourceLink = true
      } else if (targetNode?.kind === 'source') {
        edgeId = linkToSource(handle, source, target, author)
        isSourceLink = true
      } else {
        edgeId = createEdge(handle, { source, target }, author)
      }
      if (edgeId) {
        setSelectedNodeIds(new Set())
        setSelectedEdgeIds(new Set([edgeId]))
        // §7 v1.9 : pour un lien standard (hors « source de »), propose les préréglages
        // près du curseur. Le lien existe déjà (style « automatique ») et reste
        // sélectionné → la barre du lien permet aussi de l'ajuster ensuite.
        if (!isSourceLink && wrapperRef.current && lastPointerScreen.current) {
          const rect = wrapperRef.current.getBoundingClientRect()
          setPresetChooser({
            edgeId,
            screenX: lastPointerScreen.current.x - rect.left,
            screenY: lastPointerScreen.current.y - rect.top
          })
        }
      }
    },
    [handle, author]
  )

  // Pendant un tracé de connexion (§1) : révéler toutes les poignées (classe sur
  // le conteneur) pour viser la cible facilement. Relâcher dans le vide = annuler.
  const onConnectStart = useCallback(() => setConnecting(true), [])
  const onConnectEnd = useCallback(() => setConnecting(false), [])

  // Clic droit sur un lien → menu contextuel (§1 : modifier / inverser / supprimer).
  // Masqué pour un visiteur (§6) : ses actions d'édition sont interdites.
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: CosintFlowEdge) => {
      if (!canEdit) return
      event.preventDefault()
      const rect = wrapperRef.current!.getBoundingClientRect()
      setEdgeMenu({
        screenX: event.clientX - rect.left,
        screenY: event.clientY - rect.top,
        edgeId: edge.id
      })
    },
    [canEdit]
  )

  // Double-clic sur un lien → ajoute un point de passage à l'endroit cliqué (§1
  // v1.6). L'index d'insertion est le segment le plus proche du clic (endpoints
  // approchés par les centres des nœuds — le point est posé à la position exacte).
  const onEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: CosintFlowEdge) => {
      if (!canEdit) return
      event.stopPropagation()
      const board = boardEdgesRef.current.find((candidate) => candidate.id === edge.id)
      if (!board) return
      const s = nodeCentersRef.current.get(board.source)
      const target = nodeCentersRef.current.get(board.target)
      if (!s || !target) return
      const flow = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const waypoints = board.waypoints ?? []
      const points = [
        { x: s.cx, y: s.cy },
        ...waypoints,
        { x: target.cx, y: target.cy }
      ]
      // Segment (points[j], points[j+1]) le plus proche du clic → insertion à j.
      let bestSeg = 0
      let bestDist = Infinity
      for (let j = 0; j < points.length - 1; j++) {
        const d = distanceToSegment(flow.x, flow.y, points[j], points[j + 1])
        if (d < bestDist) {
          bestDist = d
          bestSeg = j
        }
      }
      const next = [...waypoints.slice(0, bestSeg), { x: flow.x, y: flow.y }, ...waypoints.slice(bestSeg)]
      updateEdge(handle, edge.id, { waypoints: next }, author)
    },
    [canEdit, handle, author, reactFlow]
  )

  // ——— Mode « Dessiner le tracé » (§1 v1.7.1) ———
  // Entrée par la barre du lien ou son menu contextuel. Le tracé dessiné REMPLACE
  // le routage manuel existant du lien (waypoints + ancres), en une seule
  // transaction Yjs (une seule étape d'annulation).
  const startRouteDraw = useCallback(
    (edgeId: string) => {
      if (!canEdit) return
      setEdgeMenu(null)
      // On désélectionne : la barre du lien et les poignées v1.6 laissent place à
      // la couche de dessin (le lien reste visible en dessous, pour référence).
      setSelectedNodeIds(new Set())
      setSelectedEdgeIds(new Set())
      setRouteDraw({ edgeId, step: 'source', sourceAnchor: null, waypoints: [] })
    },
    [canEdit]
  )

  const cancelRouteDraw = useCallback(() => {
    const draw = routeDrawRef.current
    setRouteDraw(null)
    if (draw) setSelectedEdgeIds(new Set([draw.edgeId]))
  }, [])

  const finishRouteDraw = useCallback(
    (targetAnchor: EdgeAnchor | null) => {
      const draw = routeDrawRef.current
      if (!draw) return
      if (canEdit) {
        setEdgeRouting(
          handle,
          draw.edgeId,
          { waypoints: draw.waypoints, sourceAnchor: draw.sourceAnchor, targetAnchor },
          author
        )
      }
      setRouteDraw(null)
      // Re-sélectionne le lien : le résultat s'inspecte/ajuste immédiatement
      // (poignées v1.6 + barre contextuelle).
      setSelectedEdgeIds(new Set([draw.edgeId]))
    },
    [handle, author, canEdit]
  )

  // Si le lien dessiné disparaît (suppression par un pair) ou si mon rôle passe
  // en lecture seule, le mode dessin s'interrompt proprement.
  useEffect(() => {
    if (!routeDraw) return
    if (!canEdit || !boardEdges.some((edge) => edge.id === routeDraw.edgeId)) setRouteDraw(null)
  }, [routeDraw, boardEdges, canEdit])

  // §7 v1.9 : ferme le sélecteur de préréglage si le lien disparaît (suppression par
  // un pair) ou si le rôle passe en lecture seule.
  useEffect(() => {
    if (!presetChooser) return
    if (!canEdit || !boardEdges.some((edge) => edge.id === presetChooser.edgeId)) {
      setPresetChooser(null)
    }
  }, [presetChooser, boardEdges, canEdit])

  // Reconnexion d'une extrémité de lien (§1 v1.6) : tirer l'extrémité vers une AUTRE
  // poignée du MÊME nœud fixe le côté d'ancrage. On ne fixe QUE l'extrémité réellement
  // déplacée (mémorisée au démarrage) : sinon l'autre extrémité, dont le handle « auto »
  // courant est reporté par React Flow, serait figée à tort. On ignore les dépôts vers
  // un autre nœud (pas de re-câblage : la source/cible d'un lien est immuable).
  const reconnectEndRef = useRef<'source' | 'target' | null>(null)
  const onReconnectStart = useCallback(
    (_event: unknown, _edge: CosintFlowEdge, handleType: 'source' | 'target') => {
      reconnectEndRef.current = handleType
    },
    []
  )
  const onReconnect = useCallback(
    (oldEdge: CosintFlowEdge, connection: Connection) => {
      const which = reconnectEndRef.current
      reconnectEndRef.current = null
      if (!canEdit || !which) return
      const board = oldEdge.data?.board
      if (!board) return
      // Le dépôt doit rester sur le MÊME nœud (source/cible inchangées).
      if (connection.source !== board.source || connection.target !== board.target) return
      const anchors: Array<'t' | 'b' | 'l' | 'r'> = ['t', 'b', 'l', 'r']
      const handleId = which === 'source' ? connection.sourceHandle : connection.targetHandle
      if (typeof handleId !== 'string' || !(anchors as string[]).includes(handleId)) return
      setEdgeAnchor(handle, oldEdge.id, which, handleId as 't' | 'b' | 'l' | 'r', author)
    },
    [canEdit, handle, author]
  )
  const onReconnectEnd = useCallback(() => {
    reconnectEndRef.current = null
  }, [])

  const onNodesDelete = useCallback(
    (deleted: CosintFlowNode[]) => deleteNodes(handle, deleted.map((node) => node.id)),
    [handle]
  )

  const onEdgesDelete = useCallback(
    (deleted: CosintFlowEdge[]) => deleteEdges(handle, deleted.map((edge) => edge.id)),
    [handle]
  )

  // ——— Création de nœuds ———
  const addNodeAt = useCallback(
    (kind: NodeKind, flowX: number, flowY: number, extra?: Partial<BoardNodeData>) => {
      const size = {
        width: extra?.width ?? DEFAULT_SIZES[kind].width,
        height: extra?.height ?? DEFAULT_SIZES[kind].height
      }
      const id = createNode(
        handle,
        {
          kind,
          x: flowX - size.width / 2,
          y: flowY - size.height / 2,
          width: size.width,
          height: size.height,
          content: extra?.content,
          title: extra?.title
        },
        author
      )
      justCreatedId.current = id
      setSelectedNodeIds(new Set([id]))
      setSelectedEdgeIds(new Set())
    },
    [handle, author]
  )

  const canvasCenterFlow = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return reactFlow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    })
  }, [reactFlow])

  const addNodeCenter = useCallback(
    (kind: NodeKind) => {
      const center = canvasCenterFlow()
      addNodeAt(kind, center.x, center.y)
    },
    [addNodeAt, canvasCenterFlow]
  )

  // Création d'une entité/source à une position (§3, §4), puis sélection pour
  // édition immédiate dans le panneau Détails.
  const addEntityAt = useCallback(
    (entityType: EntityType, flowX: number, flowY: number) => {
      const size = DEFAULT_SIZES.entity
      const id = createEntity(
        handle,
        entityType,
        { x: flowX - size.width / 2, y: flowY - size.height / 2 },
        author
      )
      justCreatedId.current = id
      setSelectedEdgeIds(new Set())
      setSelectedNodeIds(new Set([id]))
    },
    [handle, author]
  )

  const addSourceAt = useCallback(
    (flowX: number, flowY: number) => {
      const size = DEFAULT_SIZES.source
      const id = createSource(handle, { x: flowX - size.width / 2, y: flowY - size.height / 2 }, author)
      justCreatedId.current = id
      setSelectedEdgeIds(new Set())
      setSelectedNodeIds(new Set([id]))
    },
    [handle, author]
  )

  // Ouvre le sélecteur d'entité par catégories (§2) au centre ou à une position.
  const openEntityPicker = useCallback(
    (pos?: { x: number; y: number }) => setEntityPickerAt(pos ?? canvasCenterFlow()),
    [canvasCenterFlow]
  )

  // §2 v1.8.2 (§2 v1.8.6) : datation en attente lors d'un ajout d'ENTITÉ depuis la frise —
  // la datation (date précise / fourchette / durée) est choisie AVANT le type, puis
  // appliquée à l'entité une fois créée.
  const pendingTimingRef = useRef<AddTiming | null>(null)

  const pickEntityType = useCallback(
    (typeId: EntityType) => {
      const pos = entityPickerAt ?? canvasCenterFlow()
      // §5 v1.6 : la catégorie « Code » du sélecteur crée un nœud « code », pas une entité.
      if (typeId === CODE_BLOCK_PICK) addNodeAt('code', pos.x, pos.y)
      else addEntityAt(typeId, pos.x, pos.y)
      const timing = pendingTimingRef.current
      if (timing && justCreatedId.current) {
        setEventTiming(handle, justCreatedId.current, timing, author)
      }
      pendingTimingRef.current = null
      setEntityPickerAt(null)
    },
    [entityPickerAt, addEntityAt, addNodeAt, canvasCenterFlow, handle, author]
  )

  /** Ajoute un nœud simple ou une source au centre (barre d'outils). */
  // §5 v1.9 : dialogue de choix de fichier (barre d'outils / menu d'ajout). La
  // position de dépôt est mémorisée le temps de la sélection. Déclaré AVANT
  // addFromToolbar, qui le référence.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFilePos = useRef<{ x: number; y: number } | null>(null)
  const openFilePicker = useCallback((pos?: { x: number; y: number }) => {
    if (!canEditRef.current) return
    pendingFilePos.current = pos ?? null
    fileInputRef.current?.click()
  }, [])

  const addFromToolbar = useCallback(
    (kind: NodeKind) => {
      if (kind === 'source') {
        const center = canvasCenterFlow()
        addSourceAt(center.x, center.y)
      } else if (kind === 'file') {
        // §5 v1.9 : ouvre un dialogue de fichier (le bouton n'a pas d'octets à lui seul).
        openFilePicker()
      } else if (kind !== 'entity') {
        addNodeCenter(kind)
      }
    },
    [addNodeCenter, addSourceAt, canvasCenterFlow, openFilePicker]
  )

  /** §2 v1.8.2 : ajoute un élément DATÉ depuis la frise. La date d'événement est déjà
   * validée par le sélecteur de la frise (sans elle, cette fonction n'est pas appelée).
   * Une entité passe par le sélecteur de type ; les autres nœuds sont créés puis datés. */
  const addDatedFromTimeline = useCallback(
    (kind: NodeKind, timing: AddTiming) => {
      if (kind === 'entity') {
        pendingTimingRef.current = timing
        openEntityPicker()
        return
      }
      const center = canvasCenterFlow()
      if (kind === 'source') addSourceAt(center.x, center.y)
      else addNodeAt(kind, center.x, center.y)
      if (justCreatedId.current) {
        setEventTiming(handle, justCreatedId.current, timing, author)
      }
    },
    [canvasCenterFlow, addSourceAt, addNodeAt, openEntityPicker, handle, author]
  )

  // Double-clic sur le fond → menu de type de nœud (§6). Désactivé pour un
  // visiteur (§6 v1.4).
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!canEdit) return
      const target = event.target as HTMLElement
      if (!target.classList.contains('react-flow__pane')) return
      const rect = wrapperRef.current!.getBoundingClientRect()
      const flow = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setAddMenu({
        screenX: event.clientX - rect.left,
        screenY: event.clientY - rect.top,
        flowX: flow.x,
        flowY: flow.y
      })
    },
    [reactFlow, canEdit]
  )

  // ——— Images : collage (Ctrl+V) et glisser-déposer (§1/§3) ———
  // L'image est compressée (§1.3) puis découpée en chunks dans `files` (§1.2) ;
  // le nœud ne référence que son hash — jamais une grosse valeur base64 insérée
  // d'un coup qui ferait tomber la connexion.
  const insertImageBlob = useCallback(
    async (blob: Blob, flowPos?: { x: number; y: number }) => {
      if (!canEdit) return
      const result = await processImage(blob, BOARD_IMAGE_PROFILE)
      if (!result.ok) {
        if (result.reason === 'too-large') {
          pushToast(
            t('image.tooLarge', { size: formatNumber((result.sizeBytes ?? 0) / 1024 / 1024) }),
            'error'
          )
        } else if (result.reason === 'incompressible') {
          pushToast(t('image.incompressible'), 'error')
        } else {
          pushToast(t('image.readError'), 'error')
        }
        return
      }
      const hash = await registerFile(handle, result.dataUrl, {
        width: result.width,
        height: result.height
      })
      if (!hash) {
        pushToast(t('image.readError'), 'error')
        return
      }
      const size = initialImageNodeSize(result.width, result.height)
      const position = flowPos ?? canvasCenterFlow()
      addNodeAt('image', position.x, position.y, { content: hash, ...size })
      if (result.compressed) pushToast(t('image.compressed'), 'info')
    },
    [addNodeAt, canvasCenterFlow, pushToast, handle, canEdit]
  )

  // ——— §5 v1.9 : import de fichiers quelconques (.pdf, .txt…) ———
  // Non compressés (contrairement aux images) : la data-URL brute est découpée en
  // chunks dans `files` comme une image ; le nœud « file » ne référence que le hash.
  const insertFileBlob = useCallback(
    async (file: File, flowPos?: { x: number; y: number }) => {
      if (!canEdit) return
      if (file.size > FILE_HARD_LIMIT) {
        pushToast(t('file.tooLarge', { size: formatNumber(FILE_HARD_LIMIT / 1024 / 1024, 0) }), 'error')
        return
      }
      let dataUrl: string
      try {
        dataUrl = await fileToDataUrl(file)
      } catch {
        pushToast(t('file.readError'), 'error')
        return
      }
      const hash = await registerFile(handle, dataUrl)
      if (!hash) {
        pushToast(t('file.readError'), 'error')
        return
      }
      const position = flowPos ?? canvasCenterFlow()
      // §5 v1.9 (aperçu) : taille initiale adaptée à l'aperçu (page PDF, extrait texte…).
      const size = initialFileNodeSize(detectPreviewKind(file.type, file.name))
      addNodeAt('file', position.x, position.y, { content: hash, title: file.name, ...size })
    },
    [addNodeAt, canvasCenterFlow, pushToast, handle, canEdit]
  )

  // ——— Copier / couper / coller natifs du canvas (§2 v1.7) ———
  // On passe par les évènements presse-papiers du DOM (copy/cut/paste), et NON par le
  // répartiteur de raccourcis : (a) ils donnent accès au `clipboardData` (lecture
  // impossible autrement sous sandbox) ; (b) quand le focus est dans un champ de
  // saisie, le navigateur applique son copier-coller de TEXTE natif et nos gardes
  // laissent passer. La copie interne (variable de module) sert de source pleine
  // fidélité (images incluses) lors du collage, y compris entre tableaux.
  useEffect(() => {
    // Ne PAS agir sur les nœuds si le focus est dans un champ de saisie (copier-coller
    // de texte natif), si une modale est ouverte (assistant CSV, dialogues), ou dans un
    // panneau d'édition (Détails, barres contextuelles) — mêmes gardes que le
    // répartiteur de raccourcis, sinon Ctrl+X y couperait la sélection du canvas.
    const inEditableField = (target: EventTarget | null): boolean => {
      if (document.querySelector('.cm-modal-overlay')) return true
      return (
        target instanceof HTMLElement &&
        target.closest('input, textarea, [contenteditable="true"], .bd-side, .et-bar, .bd-toolbar') !== null
      )
    }

    // Fragment de presse-papiers depuis la sélection courante (nœuds + liens
    // internes + data-URL des images, sous budget d'octets, dédupliquées par hash).
    // Nombre d'images d'entité laissées hors du DERNIER fragment construit.
    let lastClipSkippedImages = 0
    const buildSelectionClip = (): ClipData | null => {
      const nodeIdSet = selectedNodeIdsRef.current
      if (nodeIdSet.size === 0) return null
      const nodes = boardNodesRef.current.filter((node) => nodeIdSet.has(node.id))
      if (nodes.length === 0) return null
      const edges = boardEdgesRef.current.filter(
        (edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
      )
      const files: ClipFile[] = []
      const seenHashes = new Set<string>()
      let budget = CLIP_FILE_BUDGET
      // §2 v1.9 (galerie) : images d'entité NON embarquées (budget dépassé / pas encore
      // reçues), dédupliquées par hash — annoncées dès la copie (notifyClipSkipped).
      const skippedImages = new Set<string>()
      // §2/§5 v1.9 : on embarque les octets référencés par hash — nœud image OU
      // fichier (`content`), ET toutes les images de la galerie d'une entité
      // (`images`) — pour que le collage entre tableaux ne perde jamais la pièce jointe.
      for (const node of nodes) {
        const refs: string[] = []
        if (
          (node.kind === 'image' || node.kind === 'file') &&
          node.content !== '' &&
          !node.content.startsWith('data:')
        ) {
          refs.push(node.content)
        }
        // Ordre du budget = ordre de la galerie (couverture d'abord, puis ordre d'ajout,
        // donc les plus anciennes d'abord) : ce sont les dernières ajoutées qui sautent.
        const galleryRefs = entityImageFileRefs(node.images)
        const galleryRefSet = new Set(galleryRefs)
        refs.push(...galleryRefs)
        for (const hash of refs) {
          if (seenHashes.has(hash)) continue // fichier partagé → une seule fois
          const status = readFileStatus(handle.doc, hash)
          if (status.status === 'complete' && status.dataUrl.length <= budget) {
            files.push({ hash, dataUrl: status.dataUrl })
            seenHashes.add(hash)
            skippedImages.delete(hash)
            budget -= status.dataUrl.length
          } else if (galleryRefSet.has(hash)) {
            skippedImages.add(hash)
          }
        }
      }
      lastClipSkippedImages = skippedImages.size
      return buildClip(nodes, edges, files, newId())
    }
    // Annonce, au moment de la copie, les images d'entité qui ne suivront pas un
    // collage dans un AUTRE tableau (le collage dans ce tableau les retrouve).
    const notifyClipSkipped = (): void => {
      if (lastClipSkippedImages > 0) {
        pushToast(t('entity.imagesNotCopied', { count: lastClipSkippedImages }), 'info')
      }
    }

    // Position (coordonnées canvas) où coller : sous la souris si connue, sinon null.
    const pointerFlow = (): { x: number; y: number } | null => {
      const screen = lastPointerScreen.current
      return screen ? reactFlow.screenToFlowPosition(screen) : null
    }

    // Colle un fragment COSINT (nœuds/liens) avec nouveaux ids et décalage.
    const pasteClip = (clip: ClipData): void => {
      const bounds = clipBounds(clip.nodes)
      const target = pointerFlow()
      // Ancre le CENTRE de la sélection sous la souris ; à défaut, léger décalage.
      let dx = 40
      let dy = 40
      if (target) {
        dx = target.x - (bounds.minX + bounds.maxX) / 2
        dy = target.y - (bounds.minY + bounds.maxY) / 2
      }
      const remapped = remapClip(clip, { dx, dy }, author, Date.now())
      // Ré-enregistre les images absentes du tableau cible (portabilité inter-tableaux).
      for (const file of clip.files) {
        if (!hasCompleteFile(handle.doc, file.hash)) void registerFile(handle, file.dataUrl)
      }
      // §2 v1.9 (galerie) : une image d'entité dont les octets ne sont ni dans le
      // fragment ni dans ce tableau (budget de copie dépassé) est retirée du collage —
      // plutôt qu'une vignette « réception… » qui n'aboutirait jamais.
      const clipHashes = new Set(clip.files.map((file) => file.hash))
      let droppedImages = 0
      for (const node of remapped.nodes) {
        if (!node.images) continue
        const before = node.images.length
        node.images = pruneUnavailableImages(
          node.images,
          (hash) => clipHashes.has(hash) || readFileStatus(handle.doc, hash).status !== 'missing'
        )
        droppedImages += before - (node.images?.length ?? 0)
      }
      createGraph(handle, remapped.nodes, remapped.edges)
      // §2 v1.9 (galerie) : un fragment externe peut porter des images d'entité en
      // data-URL inline — re-découpées aussitôt en chunks (jamais laissées dans la
      // Y.Map du nœud jusqu'à la prochaine ouverture du tableau).
      if (remapped.nodes.some((node) => node.images?.some((image) => isInlineImageRef(image.hash)))) {
        void migrateInlineImages(handle)
      }
      setSelectedEdgeIds(new Set())
      setSelectedNodeIds(new Set(remapped.nodes.map((node) => node.id)))
      pushToast(t('clipboard.pasted', { count: remapped.nodes.length }), 'success')
      // §2 v1.9 (galerie) : on DIT ce qui n'a pas suivi (budget de copie dépassé).
      if (droppedImages > 0) pushToast(t('entity.imagesNotPasted', { count: droppedImages }), 'info')
    }

    // Colle du texte externe : e-mail/téléphone → entité typée ; URL → nœud lien ;
    // sinon note texte.
    const pasteText = (text: string): void => {
      const flow = pointerFlow() ?? canvasCenterFlow()
      const detected = detectPastedText(text)
      if (detected.kind === 'email' || detected.kind === 'phone') {
        const entityType = detected.kind === 'email' ? 'email_address' : 'phone_number'
        const fields = entityTemplateFields(entityType, author)
        if (fields.length > 0) fields[0] = { ...fields[0], value: detected.value }
        const size = DEFAULT_SIZES.entity
        const node = makeEntityNode(
          { entityType, x: flow.x - size.width / 2, y: flow.y - size.height / 2, title: detected.value, fields },
          author
        )
        createGraph(handle, [node], [])
        setSelectedEdgeIds(new Set())
        setSelectedNodeIds(new Set([node.id]))
        pushToast(
          t(detected.kind === 'email' ? 'clipboard.pastedEmail' : 'clipboard.pastedPhone'),
          'info'
        )
      } else if (detected.kind === 'link') {
        addNodeAt('link', flow.x, flow.y, { content: detected.value })
        pushToast(t('clipboard.pastedLink'), 'info')
      } else {
        addNodeAt('text', flow.x, flow.y, { content: text.slice(0, 5000) })
      }
    }

    // §1 v1.9 (copie d'image) : la sélection est-elle UNE image (complète → bitmap ; en
    // réception → toast) ou autre chose (fragment COSINT) ? Voir `imageCopyTarget`.
    const selectedImageTarget = (): ImageCopyTarget =>
      imageCopyTarget(
        boardNodesRef.current.filter((node) => selectedNodeIdsRef.current.has(node.id)),
        (hash) => {
          const status = readFileStatus(handle.doc, hash)
          if (status.status === 'complete') return status.dataUrl
          // §1 v1.9 : en réception → null (toast) ; manquante/corrompue → false (fragment).
          return status.status === 'loading' ? null : false
        }
      )

    // §1 v1.9 (copie d'image) — UNE image sélectionnée : on pose SEULEMENT le bitmap
    // (PNG) sur le presse-papiers système — coller dans Word, Paint, une messagerie ou
    // un e-mail donne l'IMAGE, jamais le JSON `cosint-clip`. L'écriture est faite ET
    // vérifiée par le processus principal ; le toast reflète le VRAI résultat. `cut` :
    // le nœud n'est supprimé QUE si l'image est bien sur le presse-papiers (jamais de
    // perte). La copie interne + `lastImageClip` permettent de recoller le nœud entier.
    const copyImageClip = async (
      imageDataUrl: string,
      clip: ClipData | null,
      cut: boolean
    ): Promise<void> => {
      if (!clip) return
      internalClip = clip
      const ok = await copyImageToClipboard(imageDataUrl)
      if (!ok) {
        pushToast(t('image.copyError'), 'error')
        return
      }
      lastImageClip = { copyId: lastImageCopyId(), clip }
      if (cut && canEditRef.current) {
        deleteNodes(handle, clip.nodes.map((node) => node.id))
        setSelectedNodeIds(new Set())
        setSelectedEdgeIds(new Set())
        pushToast(t('clipboard.cut', { count: clip.nodes.length }), 'success')
      } else {
        pushToast(t('image.copied'), 'success')
      }
    }
    const copySelectedImage = (imageDataUrl: string, cut: boolean): Promise<void> =>
      copyImageClip(imageDataUrl, buildSelectionClip(), cut)

    // §1 v1.9 : copie d'UN nœud image désigné (bouton du nœud, clic droit), quelle que
    // soit la sélection : fragment limité à ce nœud (+ son image, sous budget).
    copyImageNodeRef.current = (nodeId: string): void => {
      const node = boardNodesRef.current.find((candidate) => candidate.id === nodeId)
      if (!node || node.kind !== 'image') return
      const imageDataUrl = singleImageDataUrl([node], (hash) => {
        const status = readFileStatus(handle.doc, hash)
        return status.status === 'complete' ? status.dataUrl : null
      })
      if (!imageDataUrl) {
        // §1 v1.9 : image manquante/corrompue ≠ image en réception (message exact).
        const status = node.content.startsWith('data:')
          ? 'complete'
          : readFileStatus(handle.doc, node.content).status
        if (status === 'missing' || status === 'error') {
          pushToast(t('image.unavailable'), 'error')
        } else pushToast(t('image.copyEmpty'), 'info')
        return
      }
      const files: ClipFile[] = []
      if (!node.content.startsWith('data:')) {
        const status = readFileStatus(handle.doc, node.content)
        if (status.status === 'complete' && status.dataUrl.length <= CLIP_FILE_BUDGET) {
          files.push({ hash: node.content, dataUrl: status.dataUrl })
        }
      }
      void copyImageClip(imageDataUrl, buildClip([node], [], files, newId()), false)
    }

    // §1 v1.9 — Ctrl/Cmd+C (ou Ctrl+X, Ctrl+Inser) sur UNE image : on intercepte la
    // TOUCHE (keydown, phase de capture) et on l'annule. Ainsi NI la commande « Copier »
    // de Chromium NI l'accélérateur « Copier » du menu natif ne s'exécutent : aucun
    // évènement `copy` intermédiaire, aucune écriture concurrente du presse-papiers —
    // une seule écriture, déterministe, identique sous Windows, macOS et Linux.
    // Sélection multiple / non-image : on laisse passer (évènements copy/cut ci-dessous).
    const onClipboardKey = (event: KeyboardEvent): void => {
      const chord = clipboardChordOf(event)
      if (!chord) return // chemin rapide : toute autre touche
      // §x v1.9 : champ de saisie → copie texte native, SANS reconstruire l'image
      // (selectedImageTarget recolle tous les fragments en une data URL de plusieurs Mo).
      if (inEditableField(event.target)) return
      const decision = imageKeyAction(chord, false, selectedImageTarget())
      if (!decision) return
      event.preventDefault()
      if (event.repeat) return // touche maintenue : une seule copie
      lastKeyboardImageCopyAt = Date.now()
      // Image encore en réception : rien n'est copié (ni bitmap, ni fragment) — on le dit.
      if (decision.action === 'pending') pushToast(t('image.copyEmpty'), 'info')
      else void copySelectedImage(decision.dataUrl, decision.action === 'cut')
    }

    // §1 v1.9 : image seule via un évènement `copy`/`cut` (menu Édition › Copier/Couper,
    // Maj+Suppr…) → même chemin que la touche. `preventDefault` sans données : Chromium
    // n'écrit RIEN (vérifié), l'écriture du bitmap par le main reste donc la seule.
    // true = évènement pris en charge (image ou image en réception).
    const handleImageClipboardEvent = (event: ClipboardEvent, cut: boolean): boolean => {
      const target = selectedImageTarget()
      if (!target) return false
      event.preventDefault()
      if (Date.now() - lastKeyboardImageCopyAt > KEYBOARD_COPY_DEDUP_MS) {
        if (target.kind === 'pending') pushToast(t('image.copyEmpty'), 'info')
        else void copySelectedImage(target.dataUrl, cut)
      }
      return true
    }

    const onCopy = (event: ClipboardEvent): void => {
      if (inEditableField(event.target)) return
      if (handleImageClipboardEvent(event, false)) return
      const clip = buildSelectionClip()
      if (!clip) return
      event.preventDefault()
      // Copie interne pleine fidélité conservée (survit au remontage → collage entre
      // tableaux DANS l'appli).
      internalClip = clip
      // Sélection multiple / non-image : le fragment texte permet le collage interne
      // (nœuds + liens, pleine fidélité) et reste inoffensif à l'extérieur.
      event.clipboardData?.setData('text/plain', serializeClip(clip))
      pushToast(t('clipboard.copied', { count: clip.nodes.length }), 'info')
      notifyClipSkipped()
    }

    const onCut = (event: ClipboardEvent): void => {
      if (inEditableField(event.target)) return
      // §1 v1.9 : image seule → bitmap, puis suppression SEULEMENT si la copie a réussi.
      if (handleImageClipboardEvent(event, true)) return
      const clip = buildSelectionClip()
      if (!clip) return
      event.preventDefault()
      internalClip = clip
      event.clipboardData?.setData('text/plain', serializeClip(clip))
      // Un visiteur (lecture seule) ne peut PAS supprimer : « couper » se réduit à
      // « copier » (le toast ne ment donc pas sur ce qui s'est passé).
      if (canEditRef.current) {
        deleteNodes(handle, clip.nodes.map((node) => node.id))
        setSelectedNodeIds(new Set())
        setSelectedEdgeIds(new Set())
        pushToast(t('clipboard.cut', { count: clip.nodes.length }), 'info')
      } else {
        pushToast(t('clipboard.copied', { count: clip.nodes.length }), 'info')
      }
      notifyClipSkipped()
    }

    const onPaste = (event: ClipboardEvent): void => {
      if (inEditableField(event.target)) return
      if (!canEditRef.current) return
      // 1) Fragment COSINT (nœuds/liens) — PRIORITAIRE sur l'image quand les deux
      //    formats coexistent (copie v1.8.1 d'une image unique : garde la pleine
      //    fidélité du nœud dans l'appli, l'image restant disponible pour l'externe).
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const clip = text.trim() !== '' ? parseClip(text) : null
      if (clip) {
        event.preventDefault()
        // Préfère la copie interne pleine fidélité si le nonce correspond.
        const source = internalClip && internalClip.nonce === clip.nonce ? internalClip : clip
        pasteClip(source)
        return
      }
      // 2) Image du presse-papiers → nœud image (pipeline v1.4).
      const imageItem = [...(event.clipboardData?.items ?? [])].find((candidate) =>
        candidate.type.startsWith('image/')
      )
      const blob = imageItem?.getAsFile()
      if (blob) {
        event.preventDefault()
        const position = pointerFlow() ?? undefined
        // §1 v1.9 (copie d'image) : NOTRE image, copiée depuis un nœud image (même
        // empreinte) → le nœud est recréé en pleine fidélité (titre, tags, taille) ;
        // toute autre image → nouveau nœud image (pipeline v1.4).
        const imageClip = lastImageClip
        if (imageClip) {
          void isLastCopiedImage(blob, imageClip.copyId).then((same) => {
            if (same) pasteClip(imageClip.clip)
            else void insertImageBlob(blob, position)
          })
          return
        }
        void insertImageBlob(blob, position)
        return
      }
      // 3) Texte externe (e-mail/téléphone → entité, URL → lien, sinon note).
      if (text.trim() === '') return
      event.preventDefault()
      pasteText(text)
    }

    // §1 v1.9 : phase de CAPTURE — avant tout autre gestionnaire de touches.
    window.addEventListener('keydown', onClipboardKey, true)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      copyImageNodeRef.current = null
      window.removeEventListener('keydown', onClipboardKey, true)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [handle, author, reactFlow, pushToast, insertImageBlob, addNodeAt, canvasCenterFlow])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const dropped = [...event.dataTransfer.files]
      // §1 v1.7 : un CSV déposé ouvre l'assistant d'import (avant le filtre images —
      // sinon un drop sans image sortirait sans preventDefault et Electron naviguerait).
      const csv = dropped.find(
        (file) => file.type === 'text/csv' || /\.csv$/i.test(file.name)
      )
      if (csv && canEdit) {
        event.preventDefault()
        void csv.text().then((text) => setCsvImport({ text }))
        return
      }
      const images = dropped.filter((file) => file.type.startsWith('image/'))
      // §5 v1.9 : tout autre fichier déposé (hors CSV, déjà traité) devient un nœud fichier.
      const others = dropped.filter((file) => !file.type.startsWith('image/'))
      if (images.length === 0 && others.length === 0) return
      event.preventDefault()
      const flow = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      // §2 v1.9 (galerie) : des images déposées SUR une entité s'attachent à sa galerie
      // (au lieu de créer des nœuds image) ; sur le fond du canvas, rien ne change.
      const dropEntityId =
        canEdit && images.length > 0 ? entityIdAtPoint(event.clientX, event.clientY) : null
      if (dropEntityId) void attachEntityImageFiles(handle, dropEntityId, images, author)
      // Plusieurs fichiers déposés d'un coup : disposés en grille (sinon empilés).
      const placed = dropEntityId ? others : [...images, ...others]
      placed.forEach((file, index) => {
        const pos = fileGridPosition(flow, index, placed.length)
        if (file.type.startsWith('image/')) void insertImageBlob(file, pos)
        else void insertFileBlob(file, pos)
      })
    },
    [insertImageBlob, insertFileBlob, reactFlow, canEdit, handle, author]
  )

  // ——— Pan manuel au Ctrl+glisser sur le FOND (§3) ———
  // React Flow délègue le pan à d3-zoom, dont le filtre refuse par principe tout
  // mousedown portant Ctrl (Ctrl étant réservé au zoom molette). Le pan au
  // Ctrl+clic gauche est donc implémenté ici, à la main, en déplaçant
  // directement le viewport — uniquement quand on démarre sur le fond du canvas
  // (jamais sur un nœud : Ctrl+clic sur un nœud reste la multi-sélection).
  const ctrlPan = useRef<{
    pointerId: number
    startX: number
    startY: number
    vpX: number
    vpY: number
  } | null>(null)

  const onCanvasPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // §1 v1.7.1 — mode « Dessiner le tracé » : on capte les clics AVANT React
      // Flow (phase capture) pour qu'aucune sélection/lasso/drag ne démarre.
      const draw = routeDrawRef.current
      if (draw) {
        const target = event.target as Element
        // Les éléments du mode (pastilles d'ancrage, barre d'aide) gèrent leurs
        // propres clics — on les laisse passer.
        if (target.closest('.fl-route-ui')) return
        if (event.button !== 0) return // clic droit : onCanvasContextMenu ; autre : rien
        event.preventDefault()
        event.stopPropagation()
        const edge = boardEdgesRef.current.find((candidate) => candidate.id === draw.edgeId)
        if (!edge) return
        const nodeEl = target.closest('.react-flow__node') as HTMLElement | null
        if (draw.step === 'source') {
          // Cliquer le CORPS du nœud source = départ automatique (les pastilles
          // fixent un côté précis) ; tout autre clic est ignoré à cette étape.
          if (nodeEl?.dataset.id === edge.source) {
            setRouteDraw({ ...draw, sourceAnchor: null, step: 'path' })
          }
          return
        }
        // Étape 'path' : cliquer le corps du nœud CIBLE termine en arrivée auto ;
        // sinon le clic pose un point de passage (y compris par-dessus un nœud).
        if (nodeEl?.dataset.id === edge.target) {
          finishRouteDraw(null)
          return
        }
        const pos = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        setRouteDraw({ ...draw, waypoints: [...draw.waypoints, { x: pos.x, y: pos.y }] })
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return
      const target = event.target as HTMLElement
      // Uniquement sur le fond (pane) : pas sur un nœud, une poignée, un panneau.
      if (!target.classList.contains('react-flow__pane')) return
      const viewport = reactFlow.getViewport()
      ctrlPan.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        vpX: viewport.x,
        vpY: viewport.y
      }
      const el = event.currentTarget as HTMLElement
      el.setPointerCapture(event.pointerId)
      el.classList.add('fl-ctrl-panning') // curseur « main fermée » pendant le pan
      event.preventDefault()
    },
    [reactFlow, finishRouteDraw]
  )

  // Clic droit pendant le dessin d'un tracé : retire le dernier point posé
  // (capture : le menu contextuel des liens/nœuds ne doit pas s'ouvrir).
  const onCanvasContextMenu = useCallback((event: React.MouseEvent) => {
    const draw = routeDrawRef.current
    if (!draw) return
    event.preventDefault()
    event.stopPropagation()
    if (draw.step === 'path' && draw.waypoints.length > 0) {
      setRouteDraw({ ...draw, waypoints: draw.waypoints.slice(0, -1) })
    }
  }, [])

  // ——— Curseur temps réel (throttlé) + pan manuel ———
  const lastCursorSent = useRef(0)
  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      // §2 v1.7 : mémorise la position écran de la souris pour coller à cet endroit.
      lastPointerScreen.current = { x: event.clientX, y: event.clientY }
      const pan = ctrlPan.current
      if (pan && pan.pointerId === event.pointerId) {
        // Déplacement du viewport (px écran = px viewport, zoom inchangé).
        reactFlow.setViewport({
          x: pan.vpX + (event.clientX - pan.startX),
          y: pan.vpY + (event.clientY - pan.startY),
          zoom: reactFlow.getZoom()
        })
        return
      }
      const now = performance.now()
      if (now - lastCursorSent.current < 50) return
      lastCursorSent.current = now
      setLocalCursor(handle, reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [handle, reactFlow]
  )

  const endCtrlPan = useCallback((event: React.PointerEvent) => {
    const pan = ctrlPan.current
    if (!pan || pan.pointerId !== event.pointerId) return
    ctrlPan.current = null
    const el = event.currentTarget as HTMLElement
    el.classList.remove('fl-ctrl-panning')
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
  }, [])

  // ——— Duplication (Ctrl+D) ———
  const duplicateSelection = useCallback(() => {
    if (!canEdit) return
    const ids = [...selectedNodeIds]
    if (ids.length === 0) return
    const created = duplicateNodes(handle, ids, author)
    if (created.length > 0) setSelectedNodeIds(new Set(created))
  }, [handle, selectedNodeIds, author, canEdit])

  // ——— Suppression (Suppr / Retour arrière, clic droit) — §6bis ———
  // Confirmation demandée uniquement à partir de 3 éléments ; annulable (Ctrl+Z).
  const deleteSelection = useCallback(() => {
    if (!canEdit) return
    const nodeIds = [...selectedNodeIds]
    const edgeIds = [...selectedEdgeIds]
    const count = nodeIds.length + edgeIds.length
    if (count === 0) return
    if (count >= 3 && !window.confirm(t('delete.confirmMany', { count }))) return
    if (nodeIds.length > 0) deleteNodes(handle, nodeIds)
    if (edgeIds.length > 0) deleteEdges(handle, edgeIds)
    setSelectedNodeIds(new Set())
    setSelectedEdgeIds(new Set())
  }, [handle, selectedNodeIds, selectedEdgeIds, canEdit])

  // §1 v1.9 (copie d'image) : l'image d'un nœud est-elle DÉFINITIVEMENT indisponible
  // (fichier manquant ou corrompu, pas « en cours de réception ») ? Data-URL inline : non.
  const imageBytesUnavailable = useCallback(
    (content: string): boolean => {
      if (content === '' || content.startsWith('data:')) return false
      const status = readFileStatus(handle.doc, content).status
      return status === 'missing' || status === 'error'
    },
    [handle]
  )

  // §1 v1.9 (copie d'image) : image complète (data-URL ; null si pas encore entièrement
  // reçue) et titre d'un nœud image — actions « Copier / Enregistrer » du clic droit.
  const imageNodeSource = useCallback(
    (nodeId: string): { dataUrl: string | null; title: string; unavailable: boolean } => {
      const node = boardNodesRef.current.find((candidate) => candidate.id === nodeId)
      if (!node) return { dataUrl: null, title: '', unavailable: true }
      const dataUrl = singleImageDataUrl([node], (hash) => {
        const status = readFileStatus(handle.doc, hash)
        return status.status === 'complete' ? status.dataUrl : null
      })
      return {
        dataUrl,
        title: node.title,
        unavailable: dataUrl === null && imageBytesUnavailable(node.content)
      }
    },
    [handle, imageBytesUnavailable]
  )

  // Clic droit sur un nœud / une sélection → menu « Supprimer N élément(s) ».
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: CosintFlowNode) => {
      // §1 v1.9 (copie d'image) : un nœud image garde son menu (Copier / Enregistrer
      // l'image) même pour un visiteur ; tout autre nœud reste réservé aux éditeurs.
      const isImage = node.data.board.kind === 'image' && node.data.board.content !== ''
      if (!canEdit && !isImage) return
      event.preventDefault()
      const alreadySelected = canEdit && selectedNodeIds.has(node.id)
      const count = alreadySelected ? selectedNodeIds.size + selectedEdgeIds.size : 1
      if (!alreadySelected) {
        setSelectedNodeIds(new Set([node.id]))
        setSelectedEdgeIds(new Set())
      }
      const rect = wrapperRef.current!.getBoundingClientRect()
      // §2 v1.9 (galerie) : clic droit sur une entité seule → entrée « Ajouter une image… ».
      const entityId = count === 1 && node.data.board.kind === 'entity' ? node.id : undefined
      // §1 v1.9 (copie d'image) : clic droit sur une image seule → Copier / Enregistrer.
      const imageNodeId = count === 1 && isImage ? node.id : undefined
      setSelectionMenu({
        screenX: event.clientX - rect.left,
        screenY: event.clientY - rect.top,
        count,
        entityId,
        imageNodeId
      })
    },
    [canEdit, selectedNodeIds, selectedEdgeIds]
  )

  // ——— Raccourcis clavier CENTRALISÉS (§3 v1.6) ———
  // Plus aucune combinaison codée en dur ici : la table combinaison → action est
  // dérivée de la configuration (store/shortcuts), et chaque action pointe vers son
  // gestionnaire. Échap reste un cas à part (fermeture d'UI, non réassignable).
  const shortcutOverrides = useShortcuts((state) => state.overrides)
  useEffect(() => {
    const bindingMap = bindingToActionMap(shortcutOverrides)
    const handlers: Record<string, () => void> = {
      undo,
      redo,
      duplicate: duplicateSelection,
      delete: deleteSelection,
      zoomIn: () => void reactFlow.zoomIn({ duration: 150 }),
      zoomOut: () => void reactFlow.zoomOut({ duration: 150 }),
      fitView: () => void reactFlow.fitView({ padding: 0.2, duration: 300 }),
      search: () => setSearchOpen(true),
      toggleFilter: () => setFilterOpen((open) => !open),
      toggleSources: () => setSourcesOpen((open) => !open),
      toggleLegend: () => setLegendOpen((open) => !open),
      newText: () => addNodeCenter('text'),
      newTimestamped: () => addNodeCenter('timestamped'),
      newGroup: () => addNodeCenter('group'),
      newCode: () => addNodeCenter('code'),
      newSource: () => {
        const center = canvasCenterFlow()
        addSourceAt(center.x, center.y)
      },
      newEntity: () => openEntityPicker()
    }
    // Actions d'édition/création : réservées aux éditeurs/admin (§6).
    const editActions = new Set([
      'duplicate',
      'delete',
      'newText',
      'newTimestamped',
      'newGroup',
      'newCode',
      'newSource',
      'newEntity'
    ])
    const onKey = (event: KeyboardEvent): void => {
      // §1 v1.7.1 — mode dessin de tracé : Échap annule (rien n'est écrit),
      // Entrée termine avec une arrivée automatique. Prioritaire sur le reste,
      // SAUF si une modale est ouverte (elle gère ses touches) ou si Entrée est
      // pressée dans un champ (ex. la barre de recherche restée ouverte).
      if (routeDrawRef.current && !document.querySelector('.cm-modal-overlay')) {
        const inField = (event.target as HTMLElement).closest(
          'input, textarea, select, button, [contenteditable="true"]'
        )
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelRouteDraw()
          return
        }
        if (event.key === 'Enter' && !inField) {
          event.preventDefault()
          finishRouteDraw(null)
          return
        }
      }
      if (event.key === 'Escape') {
        // Une modale ouverte gère elle-même Échap : ne pas fermer en plus la
        // recherche/le menu d'ajout du canvas en arrière-plan.
        if (document.querySelector('.cm-modal-overlay')) return
        setAddMenu(null)
        if (searchOpen) setSearchOpen(false)
        return
      }
      // Une modale ouverte capte les raccourcis du canvas (même si le focus est
      // retombé sur <body>, hors du closest ci-dessous) : on n'agit pas sur le tableau.
      if (document.querySelector('.cm-modal-overlay')) return
      const target = event.target as HTMLElement
      // Ne jamais déclencher les raccourcis quand le focus est dans un champ ou un
      // panneau d'édition (détails, barres contextuelles) : sinon presser Suppr sur
      // un <select> du panneau supprimerait le nœud édité.
      if (
        target.closest(
          'input, textarea, select, button, [contenteditable="true"], .bd-side, .et-bar, .cm-modal-overlay'
        )
      ) {
        return
      }
      const binding = bindingFromEvent(event)
      if (!binding) return
      const actionId = bindingMap.get(binding)
      if (!actionId) return
      if (editActions.has(actionId) && !canEdit) return
      const handler = handlers[actionId]
      if (!handler) return
      event.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    shortcutOverrides,
    undo,
    redo,
    duplicateSelection,
    deleteSelection,
    reactFlow,
    searchOpen,
    canEdit,
    addNodeCenter,
    addSourceAt,
    openEntityPicker,
    canvasCenterFlow,
    cancelRouteDraw,
    finishRouteDraw
  ])

  // ——— Exports (§7) ———
  const doExportTrace = useCallback(async () => {
    try {
      // §2 v1.9 — images d'entité pas encore reçues : absentes du fichier, on le dit.
      const notExported = countUnexportableEntityImages(handle.doc)
      const json = serializeTrace(exportBoardData(handle.doc))
      const result = await window.cosint.saveTrace(toFileName(meta.title, 'trace'), json)
      if (result.saved) {
        pushToast(t('export.traceDone'), 'success')
        if (notExported > 0) {
          pushToast(t('entity.imagesNotExported', { count: notExported }), 'info')
        }
      }
      else if (result.error) pushToast(t('export.failed'), 'error')
    } catch (error) {
      pushToast(t('export.error', { message: String(error) }), 'error')
    }
  }, [handle, meta.title, pushToast])

  const doExportPng = useCallback(async () => {
    const visibleNodes = flowNodes.filter((node) => !node.hidden)
    if (visibleNodes.length === 0) {
      pushToast(t('export.emptyBoard'), 'info')
      return
    }
    setExporting(true)
    try {
      // Deux frames pour laisser disparaître curseurs et poignées de sélection.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      const background =
        getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() ||
        '#0b0d11'
      const dataUrl = await renderBoardToPng(wrapperRef.current!, visibleNodes, background)
      if (dataUrl) {
        const result = await window.cosint.savePng(toFileName(meta.title, 'png'), dataUrl)
        if (result.saved) pushToast(t('export.pngDone'), 'success')
        else if (result.error) pushToast(t('export.failed'), 'error')
      }
    } catch (error) {
      pushToast(t('export.error', { message: String(error) }), 'error')
    } finally {
      setExporting(false)
    }
  }, [flowNodes, meta.title, pushToast])

  // Rapport des sources en Markdown (§4).
  const doExportReport = useCallback(async () => {
    if (boardNodesRef.current.every((node) => node.kind !== 'source')) {
      pushToast(t('export.noSources'), 'info')
      return
    }
    try {
      const markdown = buildSourceReport(boardNodes, boardEdges, meta)
      const result = await window.cosint.saveReport(toFileName(meta.title, 'md'), markdown)
      if (result.saved) pushToast(t('export.reportDone'), 'success')
      else if (result.error) pushToast(t('export.failed'), 'error')
    } catch (error) {
      pushToast(t('export.error', { message: String(error) }), 'error')
    }
  }, [boardNodes, boardEdges, meta, pushToast])

  // ——— Export CSV (§1b v1.7, choix des colonnes §4 v1.8) : les actions du menu
  //     OUVRENT le dialogue de sélection ; l'écriture réelle se fait dans
  //     `runCsvExport` à la confirmation. ———
  const doExportCsvEntities = useCallback(() => {
    if (boardNodesRef.current.every((node) => node.kind !== 'entity')) {
      pushToast(t('csv.exportEmpty'), 'info')
      return
    }
    setCsvExport({ kind: 'entities', columns: entityColumns(boardNodesRef.current) })
  }, [pushToast])

  const doExportCsvEdges = useCallback(() => {
    if (boardEdgesRef.current.length === 0) {
      pushToast(t('csv.exportEdgesEmpty'), 'info')
      return
    }
    setCsvExport({ kind: 'edges', columns: edgeColumns(boardNodesRef.current) })
  }, [pushToast])

  // Écrit le CSV selon les colonnes cochées (§4 v1.8), puis ferme le dialogue.
  const runCsvExport = useCallback(
    async (selectedIds: string[], delimiter: CsvDelimiter) => {
      if (!csvExport) return
      try {
        if (csvExport.kind === 'entities') {
          const chosen = csvExport.columns.filter((column) => selectedIds.includes(column.id))
          const csv = exportEntitiesCsvColumns(boardNodesRef.current, chosen, { delimiter })
          const result = await window.cosint.saveCsv(toFileName(meta.title, 'csv'), csv)
          if (result.saved) pushToast(t('csv.exportEntitiesDone'), 'success')
          else if (result.error) pushToast(t('export.failed'), 'error')
        } else {
          const chosen = csvExport.columns.filter((column) => selectedIds.includes(column.id))
          const csv = exportEdgesCsvColumns(boardEdgesRef.current, chosen, { delimiter })
          const result = await window.cosint.saveCsv(toFileName(`${meta.title}_liens`, 'csv'), csv)
          if (result.saved) pushToast(t('csv.exportEdgesDone'), 'success')
          else if (result.error) pushToast(t('export.failed'), 'error')
        }
      } catch (error) {
        pushToast(t('export.error', { message: String(error) }), 'error')
      } finally {
        setCsvExport(null)
      }
    },
    [csvExport, meta.title, pushToast]
  )

  // ——— Import CSV « ici » (§1) : ajoute au tableau courant, non destructif. ———
  const importGraphHere = useCallback(
    (nodes: BoardNodeData[], edges: BoardEdgeData[]) => {
      // Un visiteur (lecture seule, §6) ne peut pas écrire dans le tableau courant.
      if (!canEdit || nodes.length === 0) return
      // Recentre le graphe importé au centre de la vue courante.
      const center = canvasCenterFlow()
      const bounds = clipBounds(nodes)
      const dx = center.x - (bounds.minX + bounds.maxX) / 2
      const dy = center.y - (bounds.minY + bounds.maxY) / 2
      const shiftedNodes = nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }))
      const shiftedEdges = edges.map((edge) =>
        edge.waypoints
          ? { ...edge, waypoints: edge.waypoints.map((point) => ({ x: point.x + dx, y: point.y + dy })) }
          : edge
      )
      createGraph(handle, shiftedNodes, shiftedEdges)
      const ids = shiftedNodes.map((node) => node.id)
      setSelectedEdgeIds(new Set())
      setSelectedNodeIds(new Set(ids))
      pushToast(t('csv.imported', { nodes: shiftedNodes.length, edges: shiftedEdges.length }), 'success')
      // Recadre la vue sur le résultat (une fois les nœuds rendus).
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          reactFlow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.25, duration: 400 })
        )
      )
    },
    [handle, canvasCenterFlow, reactFlow, pushToast, canEdit]
  )

  // Ouvre un CSV depuis un dialogue natif puis lance l'assistant d'import (§1).
  const openCsvImport = useCallback(async () => {
    const picked = await window.cosint.openCsv()
    if ('canceled' in picked) return
    if ('error' in picked) {
      pushToast(t('csv.importError', { message: picked.error }), 'error')
      return
    }
    setCsvImport({ text: picked.text, encoding: picked.encoding })
  }, [pushToast])

  // §1d : rafraîchit l'affichage sans quitter l'app — force React Flow à re-mesurer
  // tous les nœuds (poignées + dimensions) et re-synchronise la vue sur le document
  // Yjs (source de vérité). Réparation manuelle en cas de désalignement résiduel
  // (ne nécessite plus de redémarrage). `updateNodeInternals` est l'API dédiée de
  // React Flow, robuste (pas d'effet de bord de rendu).
  const refreshView = useCallback(() => {
    logSync('info', 'Rafraîchissement manuel de l’affichage.')
    updateNodeInternals(boardNodesRef.current.map((node) => node.id))
  }, [updateNodeInternals])

  // Centre la vue sur un nœud (clic depuis le panneau Sources).
  const locateNode = useCallback(
    (nodeId: string) => {
      const node = boardNodesRef.current.find((candidate) => candidate.id === nodeId)
      if (!node) return
      reactFlow.setCenter(node.x + node.width / 2, node.y + node.height / 2, {
        zoom: Math.max(reactFlow.getZoom(), 0.9),
        duration: 250
      })
      setSelectedEdgeIds(new Set())
      setSelectedNodeIds(new Set([nodeId]))
    },
    [reactFlow]
  )

  // Actions de menu applicatif relayées par App. La ref est initialisée à la
  // valeur du signal présent au montage : un signal déjà consommé par un tableau
  // précédent n'est donc jamais rejoué à l'ouverture du tableau suivant.
  const lastMenuSeq = useRef(menuSignal?.seq ?? 0)
  useEffect(() => {
    if (!menuSignal || menuSignal.seq === lastMenuSeq.current) return
    lastMenuSeq.current = menuSignal.seq
    if (menuSignal.action === 'export-trace') void doExportTrace()
    else if (menuSignal.action === 'export-png') void doExportPng()
    else if (menuSignal.action === 'export-csv') void doExportCsvEntities()
    else if (menuSignal.action === 'import-csv') {
      setCsvImport({ text: menuSignal.csvText, encoding: menuSignal.encoding })
    }
  }, [menuSignal, doExportTrace, doExportPng, doExportCsvEntities])

  // ——— Contexte fourni aux nœuds et panneaux ———
  // Les opérations d'écriture sont neutralisées pour un visiteur (§6) : défense
  // en profondeur en plus du masquage de l'UI (le filtre de réception révoque de
  // toute façon toute modification distante non autorisée).
  const contextValue = useMemo<BoardContextValue>(
    () => ({
      handle,
      profile,
      author,
      role,
      canEdit,
      canManageSharing,
      customTypes,
      customTypeMap: customTypeMapValue,
      updateNodeData: (id, patch) => canEdit && updateNode(handle, id, patch, author),
      setNodeIcon: (id, icon) => canEdit && setNodeIcon(handle, id, icon, author),
      // §2 v1.9 (galerie) : images d'entité — neutralisées pour un visiteur (§6).
      attachEntityImages: (id, files) =>
        canEdit && void attachEntityImageFiles(handle, id, files, author),
      pickEntityImages: (id) => canEdit && pickAndAttachEntityImages(handle, id, author),
      editEntityImages: (id, action) => canEdit && editEntityImages(handle, id, action, author),
      deleteNodes: (ids) => canEdit && deleteNodes(handle, ids),
      duplicateNodes: (ids) => canEdit && void duplicateNodes(handle, ids, author),
      updateEdgeData: (id, patch) => canEdit && updateEdge(handle, id, patch, author),
      deleteEdges: (ids) => canEdit && deleteEdges(handle, ids),
      setEdgeAnchor: (id, which, anchor) => canEdit && setEdgeAnchor(handle, id, which, anchor, author),
      resetEdgeRouting: (id) => canEdit && resetEdgeRouting(handle, id, author),
      setNodesStatus: (ids, status) => canEdit && setNodesStatus(handle, ids, status, author),
      setEdgesStatus: (ids, status) => canEdit && setEdgesStatus(handle, ids, status, author),
      addComment: (nodeId, text) => canEdit && void addComment(handle, nodeId, text, author),
      deleteComment: (commentId) => canEdit && deleteComment(handle, commentId),
      openExternal: (url) => void window.cosint.openExternal(url),
      // §1 v1.9 (copie d'image) : même chemin que Ctrl+C (visiteur inclus : copier une
      // image n'écrit rien dans le tableau). Ref → identité stable.
      copyImageNode: (id) => copyImageNodeRef.current?.(id),
      // §3 v1.8.1 : détection d'information partagée + liaison suggérée. Les deux
      // lisent les refs de nœuds/liens (toujours à jour) → identités stables, pas
      // de re-création du contexte à chaque changement de nœud.
      findValueMatches: (value, excludeNodeId) =>
        findValueMatches(boardNodesRef.current, value, excludeNodeId),
      createRelation: (sourceId, targetId, label) => {
        if (!canEdit || sourceId === targetId) return
        const already = boardEdgesRef.current.some(
          (edge) =>
            (edge.source === sourceId && edge.target === targetId) ||
            (edge.source === targetId && edge.target === sourceId)
        )
        if (already) {
          pushToast(t('link.alreadyLinked'), 'info')
          return
        }
        createEdge(handle, { source: sourceId, target: targetId, relationType: 'associated', label }, author)
        pushToast(t('link.connected'), 'success')
      }
    }),
    [handle, profile, author, role, canEdit, canManageSharing, customTypes, customTypeMapValue, pushToast]
  )

  // ——— Sélection unique pour le panneau latéral ———
  const selectedNode =
    selectedNodeIds.size === 1
      ? (boardNodes.find((node) => selectedNodeIds.has(node.id)) ?? null)
      : null
  const selectedEdge =
    selectedNode === null && selectedEdgeIds.size === 1
      ? (boardEdges.find((edge) => selectedEdgeIds.has(edge.id)) ?? null)
      : null

  // ——— §3 : statut de la sélection (badge posable sur nœuds ET liens) ———
  const selectionStatus: ElementStatus =
    (selectedNode?.status ?? selectedEdge?.status) ?? 'none'
  const setSelectionStatus = useCallback(
    (status: ElementStatus) => {
      if (!canEdit) return
      if (selectedNodeIds.size > 0) setNodesStatus(handle, [...selectedNodeIds], status, author)
      if (selectedEdgeIds.size > 0) setEdgesStatus(handle, [...selectedEdgeIds], status, author)
    },
    [handle, author, canEdit, selectedNodeIds, selectedEdgeIds]
  )

  const filterActive =
    activeTags.length > 0 ||
    activeColors.length > 0 ||
    activeCategories.length > 0 ||
    activeEntityTypes.length > 0 ||
    activeStatuses.length > 0

  return (
    <BoardContext.Provider value={contextValue}>
      <div className="fl-root">
        <TopBar
          title={meta.title}
          onRename={(title) => setBoardTitle(handle, title)}
          onBack={onBack}
          onShare={() => setShareOpen(true)}
          onExportTrace={() => void doExportTrace()}
          onExportPng={() => void doExportPng()}
          onExportReport={() => void doExportReport()}
          onImportCsv={() => void openCsvImport()}
          onExportCsvEntities={() => void doExportCsvEntities()}
          onExportCsvEdges={() => void doExportCsvEdges()}
          onOpenSettings={onOpenSettings}
          accessMode={meta.accessMode}
          solo={solo}
          canRename={canEdit}
          connection={connection}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          others={others}
          self={{
            name: profile.pseudo,
            color: profile.colorHex,
            avatar: { type: profile.avatarType, value: profile.avatarValue },
            role: profile.role,
            status: profile.status
          }}
        />
        <div
          className={`fl-canvas-wrap${routeDraw ? ' fl-route-drawing' : ''}`}
          ref={wrapperRef}
          onDoubleClick={onDoubleClick}
          onPointerDownCapture={onCanvasPointerDown}
          onContextMenuCapture={onCanvasContextMenu}
          onPointerMove={onPointerMove}
          onPointerUp={endCtrlPan}
          onPointerCancel={endCtrlPan}
          onPointerLeave={() => setLocalCursor(handle, null)}
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
          data-tut="board-canvas"
        >
          <ReactFlow
            className={connecting ? 'fl-connecting' : undefined}
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onEdgeContextMenu={onEdgeContextMenu}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onReconnectStart={onReconnectStart}
            onReconnect={onReconnect}
            onReconnectEnd={onReconnectEnd}
            onNodeContextMenu={onNodeContextMenu}
            onSelectionContextMenu={(event) => {
              // §1 v1.9 (copie d'image) : sélection (rectangle) réduite à UNE image →
              // Copier / Enregistrer l'image, visiteur inclus (comme le clic droit sur le nœud).
              const onlyNode =
                selectedNodeIds.size === 1 && selectedEdgeIds.size === 0
                  ? boardNodesRef.current.find((node) => selectedNodeIds.has(node.id))
                  : undefined
              const imageNodeId =
                onlyNode && onlyNode.kind === 'image' && onlyNode.content !== '' ? onlyNode.id : undefined
              if (!canEdit && !imageNodeId) return
              event.preventDefault()
              const rect = wrapperRef.current!.getBoundingClientRect()
              setSelectionMenu({
                screenX: event.clientX - rect.left,
                screenY: event.clientY - rect.top,
                count: selectedNodeIds.size + selectedEdgeIds.size,
                imageNodeId
              })
            }}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.05}
            maxZoom={4}
            // Visiteur (§6) : navigation/sélection possibles, mais ni déplacement,
            // ni connexion, ni suppression de nœuds.
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            // §5 v1.8.6 : pendant le tracé manuel d'un lien, la sélection des éléments est
            // coupée — cliquer une ZONE (ou tout nœud) pose un point de passage sans la
            // sélectionner par-dessous. Les nœuds restent déplaçables (donc cliquables :
            // le clic sur le corps du nœud cible termine bien le tracé).
            elementsSelectable={routeDraw === null}
            panOnDrag={[1, 2]}
            selectionOnDrag
            // §3 (v1.3) : Espace+glisser déplace la vue (géré par React Flow).
            // Le pan au Ctrl+glisser gauche sur le FOND est géré manuellement
            // (onCanvasPointerDown) car le filtre d3-zoom de React Flow refuse
            // tout mousedown portant Ctrl. Garder 'Control' ici sert seulement à
            // désactiver la sélection au lasso pendant que Ctrl est enfoncé, pour
            // que le pan manuel n'entre pas en concurrence avec un rectangle de
            // sélection. Ctrl+clic sur un NŒUD reste la multi-sélection
            // (multiSelectionKeyCode, chemin distinct), inchangée.
            panActivationKeyCode={['Space', 'Control']}
            zoomOnDoubleClick={false}
            // Suppression clavier gérée manuellement (§6bis : Suppr + Retour
            // arrière, confirmation ≥ 3, jamais dans un champ texte). Désactivé
            // pour un visiteur (§6).
            deleteKeyCode={null}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={28}
            defaultEdgeOptions={{ type: 'cosint' }}
            // Désactivé pendant l'export : sinon le PNG n'inclut que les éléments
            // dans le viewport courant (§7 exige le tableau entier).
            onlyRenderVisibleElements={!exporting}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--canvas-dots)" />
            {/* §2 v1.6 : publie --fl-inv-zoom sur le conteneur pour la compensation
                inverse-zoom des poignées, zones de clic, waypoints et badges. */}
            <ZoomCompensator targetRef={wrapperRef} />
            {!exporting && <CursorsOverlay others={others} />}
            {/* §1 v1.7.1 : couche du mode « Dessiner le tracé » (pastilles
                d'ancrage + aperçu), dans le repère du canvas. */}
            {routeDraw &&
              (() => {
                const edge = boardEdges.find((candidate) => candidate.id === routeDraw.edgeId)
                if (!edge) return null
                return (
                  <RouteDrawOverlay
                    sourceId={edge.source}
                    targetId={edge.target}
                    step={routeDraw.step}
                    sourceAnchor={routeDraw.sourceAnchor}
                    waypoints={routeDraw.waypoints}
                    color={colorHex(edge.color)}
                    onPickSource={(anchor) =>
                      setRouteDraw((current) =>
                        current ? { ...current, sourceAnchor: anchor, step: 'path' } : current
                      )
                    }
                    onPickTarget={(anchor) => finishRouteDraw(anchor)}
                  />
                )
              })()}
          </ReactFlow>

          {/* §4 v1.7 : vue Chronologie (frise) — overlay au-dessus du canvas (React
              Flow reste monté dessous pour ne pas perdre les mesures/le viewport). */}
          {view === 'timeline' && (
            <TimelinePanel
              nodes={boardNodes}
              boardTitle={meta.title}
              canEdit={canEdit}
              onLocate={(nodeId) => {
                setView('canvas')
                requestAnimationFrame(() => locateNode(nodeId))
              }}
              onAddDated={addDatedFromTimeline}
              onClose={() => setView('canvas')}
            />
          )}

          {/* §5 : mini-carte maison (nœuds + liens + cadre de vue + navigation).
              Masquée à l'export PNG et en vue Chronologie. */}
          {!exporting && view === 'canvas' && <BoardMiniMap nodes={boardNodes} edges={boardEdges} />}

          {/* §1 v1.7.1 : barre d'aide du mode « Dessiner le tracé » (étape en
              cours + boutons). Classe fl-route-ui : ses clics ne posent pas de
              point (voir onCanvasPointerDown). */}
          {routeDraw && (
            <div className="fl-route-hintbar fl-route-ui" role="status">
              <PenLine size={15} className="fl-route-hintbar__icon" aria-hidden="true" />
              <span>
                {routeDraw.step === 'source' ? t('edge.drawStepSource') : t('edge.drawStepPath')}
              </span>
              {routeDraw.step === 'source' ? (
                <button
                  className="cm-btn cm-btn--sm"
                  onClick={() =>
                    setRouteDraw((current) =>
                      current ? { ...current, sourceAnchor: null, step: 'path' } : current
                    )
                  }
                >
                  {t('edge.drawAutoStart')}
                </button>
              ) : (
                <button className="cm-btn cm-btn--sm" onClick={() => finishRouteDraw(null)}>
                  {t('edge.drawFinishAuto')}
                </button>
              )}
              <button className="cm-btn cm-btn--sm" onClick={cancelRouteDraw}>
                {t('common.cancel')}
              </button>
            </div>
          )}

          {boardNodes.length === 0 && initialSync.ready && (
            <div className="fl-empty-hint">{t('board.empty')}</div>
          )}

          {/* §1a : synchronisation initiale d'un nouvel arrivant — le tableau ne
              s'affiche « vide » que lorsque l'état complet est réellement reçu. */}
          {!initialSync.ready && (
            <SyncOverlay
              peerCount={initialSync.peerCount}
              nodeCount={initialSync.nodeCount}
              edgeCount={initialSync.edgeCount}
            />
          )}

          {/* §2 v1.8.2 : la barre verticale n'apparaît qu'en vue canvas ; sur la frise,
              c'est la barre horizontale du bas (TimelinePanel) qui prend le relais. */}
          {view === 'canvas' && (
          <Toolbar
            onAddNode={addFromToolbar}
            onOpenEntityPicker={() => openEntityPicker()}
            canEdit={canEdit}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onZoomIn={() => void reactFlow.zoomIn({ duration: 150 })}
            onZoomOut={() => void reactFlow.zoomOut({ duration: 150 })}
            onFitView={() => void reactFlow.fitView({ padding: 0.2, duration: 300 })}
            onToggleSearch={() => setSearchOpen((open) => !open)}
            onToggleFilter={() => setFilterOpen((open) => !open)}
            onToggleSources={() => setSourcesOpen((open) => !open)}
            onToggleLegend={() => setLegendOpen((open) => !open)}
            onToggleTimeline={() => setView((v) => (v === 'timeline' ? 'canvas' : 'timeline'))}
            filterActive={filterActive}
            searchActive={searchOpen}
            sourcesActive={sourcesOpen}
            legendActive={legendOpen}
            timelineActive={false}
          />
          )}

          {/* §5 v1.9 : dialogue de fichier natif (barre d'outils / menu d'ajout). */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])]
              const pos = pendingFilePos.current ?? canvasCenterFlow()
              pendingFilePos.current = null
              // Plusieurs fichiers choisis d'un coup : disposés en grille (sinon empilés).
              picked.forEach((file, index) => {
                void insertFileBlob(file, fileGridPosition(pos, index, picked.length))
              })
              event.target.value = ''
            }}
          />

          {searchOpen && (
            <SearchBar
              query={query}
              onQueryChange={setQuery}
              current={searchResults.length === 0 ? 0 : safeIndex + 1}
              total={searchResults.length}
              onPrev={() =>
                setSearchIndex(
                  (index) => (index - 1 + searchResults.length) % Math.max(searchResults.length, 1)
                )
              }
              onNext={() => setSearchIndex((index) => (index + 1) % Math.max(searchResults.length, 1))}
              caseSensitive={searchCaseSensitive}
              onToggleCaseSensitive={() => setSearchCaseSensitive((value) => !value)}
              wholeWord={searchWholeWord}
              onToggleWholeWord={() => setSearchWholeWord((value) => !value)}
              categories={allCategories}
              category={searchCategory}
              onCategoryChange={setSearchCategory}
              onClose={() => setSearchOpen(false)}
            />
          )}

          {filterOpen && (
            <FilterBar
              allTags={allTags}
              activeTags={activeTags}
              allColors={allColors}
              activeColors={activeColors}
              allCategories={allCategories}
              activeCategories={activeCategories}
              allEntityTypes={allEntityTypes}
              activeEntityTypes={activeEntityTypes}
              statusCounts={statusCounts}
              activeStatuses={activeStatuses}
              onToggleStatus={(status) =>
                setActiveStatuses((statuses) =>
                  statuses.includes(status)
                    ? statuses.filter((existing) => existing !== status)
                    : [...statuses, status]
                )
              }
              onToggleTag={(tag) =>
                setActiveTags((tags) =>
                  tags.includes(tag) ? tags.filter((existing) => existing !== tag) : [...tags, tag]
                )
              }
              onToggleColor={(color) =>
                setActiveColors((colors) =>
                  colors.includes(color)
                    ? colors.filter((existing) => existing !== color)
                    : [...colors, color]
                )
              }
              onToggleCategory={(category) =>
                setActiveCategories((cats) =>
                  cats.includes(category)
                    ? cats.filter((existing) => existing !== category)
                    : [...cats, category]
                )
              }
              onToggleEntityType={(typeId) =>
                setActiveEntityTypes((types) =>
                  types.includes(typeId)
                    ? types.filter((existing) => existing !== typeId)
                    : [...types, typeId]
                )
              }
              onClear={() => {
                setActiveTags([])
                setActiveColors([])
                setActiveCategories([])
                setActiveEntityTypes([])
                setActiveStatuses([])
              }}
              hiddenCount={hiddenIds.size}
              onClose={() => setFilterOpen(false)}
            />
          )}

          {addMenu && (
            <AddNodeMenu
              screenX={addMenu.screenX}
              screenY={addMenu.screenY}
              onSelect={(selection: AddSelection) => {
                if (selection.kind === 'entity') {
                  // Ouvre le sélecteur par catégories à l'emplacement du double-clic.
                  openEntityPicker({ x: addMenu.flowX, y: addMenu.flowY })
                } else if (selection.kind === 'source') {
                  addSourceAt(addMenu.flowX, addMenu.flowY)
                } else if (selection.kind === 'file') {
                  // §5 v1.9 : import de fichier à l'emplacement du double-clic.
                  openFilePicker({ x: addMenu.flowX, y: addMenu.flowY })
                } else {
                  addNodeAt(selection.kind, addMenu.flowX, addMenu.flowY)
                }
                setAddMenu(null)
              }}
              onClose={() => setAddMenu(null)}
            />
          )}

          {edgeMenu && (
            <EdgeContextMenu
              screenX={edgeMenu.screenX}
              screenY={edgeMenu.screenY}
              status={
                boardEdges.find((edge) => edge.id === edgeMenu.edgeId)?.status ?? 'none'
              }
              hasRouting={(() => {
                const edge = boardEdges.find((candidate) => candidate.id === edgeMenu.edgeId)
                return (
                  (edge?.waypoints?.length ?? 0) > 0 ||
                  edge?.sourceAnchor !== undefined ||
                  edge?.targetAnchor !== undefined
                )
              })()}
              onSetStatus={(status) => {
                setEdgesStatus(handle, [edgeMenu.edgeId], status, author)
                setEdgeMenu(null)
              }}
              onEdit={() => {
                setSelectedNodeIds(new Set())
                setSelectedEdgeIds(new Set([edgeMenu.edgeId]))
                setEdgeMenu(null)
              }}
              onDrawRoute={() => startRouteDraw(edgeMenu.edgeId)}
              onReverse={() => {
                reverseEdge(handle, edgeMenu.edgeId, author)
                setEdgeMenu(null)
              }}
              onResetRouting={() => {
                resetEdgeRouting(handle, edgeMenu.edgeId, author)
                setEdgeMenu(null)
              }}
              onDelete={() => {
                deleteEdges(handle, [edgeMenu.edgeId])
                setEdgeMenu(null)
              }}
              onClose={() => setEdgeMenu(null)}
              // §7 v1.9 : préréglage appliqué à ce lien, ou à TOUS les liens sélectionnés
              // si le lien cliqué fait partie d'une sélection de plusieurs liens.
              presetEdgeIds={
                selectedEdgeIds.has(edgeMenu.edgeId) && selectedEdgeIds.size > 1
                  ? [...selectedEdgeIds]
                  : [edgeMenu.edgeId]
              }
            />
          )}

          {presetChooser && (
            <EdgePresetChooser
              screenX={presetChooser.screenX}
              screenY={presetChooser.screenY}
              edgeId={presetChooser.edgeId}
              onPickAutomatique={() => setPresetChooser(null)}
              onPickPreset={(preset: LinkPresetDef) => {
                applyEdgePreset(handle, [presetChooser.edgeId], preset, author)
                setPresetChooser(null)
              }}
              onClose={() => setPresetChooser(null)}
            />
          )}

          {selectionMenu && (
            <SelectionContextMenu
              screenX={selectionMenu.screenX}
              screenY={selectionMenu.screenY}
              count={selectionMenu.count}
              status={selectionStatus}
              onSetStatus={setSelectionStatus}
              onDelete={deleteSelection}
              // §7 v1.9 : « Appliquer un préréglage » à tous les liens de la sélection.
              edgeIds={[...selectedEdgeIds]}
              onAddImages={
                selectionMenu.entityId
                  ? () => contextValue.pickEntityImages(selectionMenu.entityId!)
                  : undefined
              }
              // §1 v1.9 (copie d'image) : Copier / Enregistrer l'image (visiteur inclus).
              onCopyImage={
                selectionMenu.imageNodeId
                  ? () => copyImageNodeRef.current?.(selectionMenu.imageNodeId!)
                  : undefined
              }
              onSaveImage={
                selectionMenu.imageNodeId
                  ? () => {
                      const source = imageNodeSource(selectionMenu.imageNodeId!)
                      if (source.unavailable) pushToast(t('image.unavailable'), 'error')
                      else void saveImageAs(source.dataUrl, source.title)
                    }
                  : undefined
              }
              readOnly={!canEdit}
              onClose={() => setSelectionMenu(null)}
            />
          )}

          {sourcesOpen && (
            <SourcesPanel
              sources={sources}
              attachedCounts={attachedCounts}
              onLocate={locateNode}
              onClose={() => setSourcesOpen(false)}
            />
          )}

          {legendOpen && (
            <LegendPanel
              nodes={boardNodes}
              edges={boardEdges}
              onClose={() => setLegendOpen(false)}
            />
          )}

          {/* Barre contextuelle du lien sélectionné (§1) — éditeurs/admin (§6). */}
          {selectedEdge && canEdit && !routeDraw && (
            <EdgeToolbar
              edge={selectedEdge}
              onDrawRoute={() => startRouteDraw(selectedEdge.id)}
              onClose={() => setSelectedEdgeIds(new Set())}
            />
          )}

          {/* Barre contextuelle de personnalisation d'entité/source (§4). */}
          {canEdit && selectedNode && (selectedNode.kind === 'entity' || selectedNode.kind === 'source') && (
            <NodeToolbar
              node={selectedNode}
              copiedStyle={copiedStyle}
              onCopyStyle={(style) => {
                setCopiedStyle(style)
                pushToast(t('nodeStyle.styleCopied'), 'info')
              }}
              onClose={() => setSelectedNodeIds(new Set())}
            />
          )}

          {/* §2 v1.9 (galerie) : visionneuse des images d'une entité (clic sur la
              couverture du nœud ou sur une vignette du panneau Détails). */}
          <EntityLightbox />

          {/* §5 v1.9 (aperçu) : visionneuse d'un fichier (double-clic sur un nœud
              fichier, bouton « Aperçu » du nœud ou du panneau Détails). */}
          <FileViewer />

          {(selectedNode || selectedEdge) && (
            <SidePanel
              node={selectedNode}
              edge={selectedEdge}
              onClose={() => {
                setSelectedNodeIds(new Set())
                setSelectedEdgeIds(new Set())
              }}
            />
          )}
        </div>

        {shareOpen && (
          <ShareDialog
            solo={solo}
            code={handle.shareCode}
            participantCount={connection.participantCount}
            accessMode={meta.accessMode}
            accessLog={meta.accessLog}
            participantLimit={meta.participantLimit}
            canManage={canManageSharing}
            myUserId={profile.userId}
            adminId={meta.adminId}
            participants={participants}
            onGenerate={(mode) => {
              onGenerateShare(mode)
              setShareOpen(false)
            }}
            onRevoke={() => {
              onRevokeShare()
              setShareOpen(false)
            }}
            onRegenerate={(mode) => {
              onRegenerateShare(mode)
              setShareOpen(false)
            }}
            onSetMode={(mode) => setAccessMode(handle, mode, author)}
            onSetLimit={(limit) => setParticipantLimit(handle, limit)}
            onSetRole={(userId, newRole) => setParticipantRole(handle, userId, newRole)}
            onExclude={(userId) => excludeParticipant(handle, userId)}
            onTransferAdmin={(userId) => transferAdmin(handle, userId)}
            onClose={() => setShareOpen(false)}
          />
        )}

        {/* Panneau de diagnostic de connexion (v1.3, §1.4 ; refresh + journal §1d). */}
        {diagnosticsOpen && (
          <DiagnosticsPanel
            connection={connection}
            onRetest={() => retestBoardConnection(handle)}
            onRefreshView={refreshView}
            onClose={() => setDiagnosticsOpen(false)}
          />
        )}

        {entityPickerAt && (
          <EntityPicker onPick={pickEntityType} onClose={() => setEntityPickerAt(null)} />
        )}

        {/* §1 v1.7 : assistant d'import CSV (auto / assisté). */}
        {csvImport && (
          <CsvImportDialog
            csvText={csvImport.text}
            encoding={csvImport.encoding}
            author={author}
            onClose={() => setCsvImport(null)}
            onImportHere={importGraphHere}
            onImportNewBoard={onImportCsvNewBoard}
          />
        )}

        {/* §4 v1.8 : choix des colonnes pour l'export CSV (entités ou liens). */}
        {csvExport && (
          <CsvExportDialog
            title={
              csvExport.kind === 'entities'
                ? t('csv.exportEntitiesTitle')
                : t('csv.exportEdgesTitle')
            }
            columns={csvExport.columns}
            onClose={() => setCsvExport(null)}
            onConfirm={runCsvExport}
          />
        )}

        {/* §7 v1.9 : fenêtre des préréglages de lien (gérer / créer, appliquer). */}
        <LinkPresetDialog />
      </div>
    </BoardContext.Provider>
  )
}
