/**
 * Paramètres — §4 v1.8.8 : réorganisés en ONGLETS.
 *
 * Avant, tout tenait sur une seule page : profil, thème, langue, raccourcis,
 * mode réseau, ICE, jeton, mises à jour et récapitulatif s'y succédaient, et
 * chercher un réglage revenait à faire défiler. Chaque famille a désormais son
 * onglet ; le pied (Annuler / Enregistrer) reste COMMUN — un seul enregistrement
 * valide l'ensemble, quel que soit l'onglet où l'on se trouve.
 *
 * Ce qui ne change pas :
 *  - le thème et la langue s'appliquent EN DIRECT et se restaurent si l'on annule ;
 *  - le profil et le réseau ne sont appliqués qu'à l'enregistrement ;
 *  - le récapitulatif « Ce que l'application contactera » est calculé par la MÊME
 *    fonction (`effectiveNetworkConfig`) que celle qui ouvre les connexions : ce
 *    qui est affiché est exactement ce que le logiciel fera.
 *
 * §réseau v1.7.1 — mode réseau explicite :
 *  - « Standard (Internet) » : serveurs publics par défaut (remplaçables) ;
 *  - « 100 % local (auto-hébergé) » : SEULES les adresses internes saisies sont
 *    utilisées — jamais de repli public.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  GraduationCap,
  Info,
  KeyRound,
  Keyboard,
  Spline,
  Palette,
  Radar,
  Server,
  ShieldCheck,
  TriangleAlert,
  Upload,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import { LOCALES, LOCALE_LABELS, setLocale, t, type Locale, type MessageKey } from '@/i18n'
import {
  DEFAULT_SIGNALING_URLS,
  effectiveNetworkConfig,
  isValidSignalingUrl,
  parseIceServers,
  parseSignalingUrls,
  useSettings,
  type EffectiveNetworkConfig,
  type NetworkMode,
  type Theme,
  type ToolbarPosition
} from '@/store/settings'
import { ICE_SERVERS } from '@/sync/network'
import { parseOrgProfile, serializeOrgProfile } from '@/lib/orgProfile'
import { locateServer } from '@/sync/discovery'
import { REPO_URL, deployGuideUrl, openExternal } from '@/lib/project'
import { useToasts } from '@/store/toasts'
import { useTutorial } from '@/store/tutorial'
import { USER_COLORS } from '@/lib/colors'
import type { UserProfile } from '@/types'
import { Modal } from '@/components/common/Modal'
import { AuthorTag } from '@/components/common/AuthorTag'
import { ProfileEditor } from '@/components/common/ProfileEditor'
import { ShortcutsSettings } from '@/components/home/ShortcutsSettings'
// §7 v1.9 : onglet « Liens » — gestion des préréglages de lien (réglage local).
import { LinkPresetManager } from '@/components/board/LinkPresetManager'
import cosintLogo from '@/assets/logo.png'
import { vh3 } from '@/lib/vh3'
import './home.css'

interface SettingsDialogProps {
  onClose: () => void
}

/** Onglets, dans leur ordre d'affichage. */
type SettingsTab = 'profile' | 'appearance' | 'shortcuts' | 'links' | 'network' | 'about'

const TABS: ReadonlyArray<{ id: SettingsTab; labelKey: MessageKey; icon: LucideIcon }> = [
  { id: 'profile', labelKey: 'settings.tabProfile', icon: UserRound },
  { id: 'appearance', labelKey: 'settings.tabAppearance', icon: Palette },
  { id: 'shortcuts', labelKey: 'settings.tabShortcuts', icon: Keyboard },
  // §7 v1.9 : préréglages de lien (enregistrés immédiatement, propres au poste).
  { id: 'links', labelKey: 'settings.tabLinks', icon: Spline },
  { id: 'network', labelKey: 'settings.tabNetwork', icon: Globe },
  { id: 'about', labelKey: 'settings.tabAbout', icon: Info }
]

/** Copie de travail du profil (repli sûr si le store était vide). */
function draftProfile(profile: UserProfile | null): UserProfile {
  return (
    profile ?? {
      userId: crypto.randomUUID(),
      pseudo: '',
      colorHex: USER_COLORS[0],
      avatarType: 'initials',
      avatarValue: '',
      role: '',
      status: 'available'
    }
  )
}

/** URL(s) d'un RTCIceServer sous forme de liste plate (affichage récap). */
function iceUrls(server: RTCIceServer): string[] {
  return Array.isArray(server.urls) ? server.urls : [server.urls]
}

/**
 * Récapitulatif « Ce que l'application contactera » — miroir exact de la
 * configuration réseau effective. Chaque adresse est étiquetée : publique (par
 * défaut) ou saisie par l'utilisateur. Le verdict final dit s'il reste un
 * service public contacté.
 */
function NetworkRecap({ config }: { config: EffectiveNetworkConfig }): JSX.Element {
  // Étiquetage fiable par IDENTITÉ : effectiveNetworkConfig renvoie les listes
  // par défaut par référence quand (et seulement quand) elles sont utilisées.
  const signalingPublic = config.signalingUrls === DEFAULT_SIGNALING_URLS
  const icePublic = config.iceServers === ICE_SERVERS
  return (
    <div className="hm-recap" role="status">
      <div className="hm-recap__title">{t('settings.recapTitle')}</div>
      <dl className="hm-recap__grid">
        <dt>{t('settings.recapSignaling')}</dt>
        <dd>
          {config.signalingUrls.length === 0 ? (
            config.mode === 'local' ? (
              <span className="hm-recap__warn">
                <TriangleAlert size={13} aria-hidden="true" /> {t('settings.recapNoSignaling')}
              </span>
            ) : (
              t('settings.recapNone')
            )
          ) : (
            config.signalingUrls.map((url) => (
              <span key={url} className="hm-recap__item">
                <code>{url}</code>{' '}
                <em>({signalingPublic ? t('settings.recapPublic') : t('settings.recapCustom')})</em>
              </span>
            ))
          )}
        </dd>
        <dt>{t('settings.recapIce')}</dt>
        <dd>
          {config.iceServers.length === 0 ? (
            <span>{t('settings.recapNoIce')}</span>
          ) : (
            config.iceServers.flatMap((server) =>
              iceUrls(server).map((url) => (
                <span key={url} className="hm-recap__item">
                  <code>{url}</code>{' '}
                  <em>({icePublic ? t('settings.recapPublic') : t('settings.recapCustom')})</em>
                </span>
              ))
            )
          )}
        </dd>
        <dt>{t('settings.recapUpdate')}</dt>
        <dd>{config.updateCheck ? t('settings.recapUpdateOn') : t('settings.recapUpdateOff')}</dd>
        {config.mode === 'local' && (
          <>
            <dt>{t('settings.recapToken')}</dt>
            <dd>
              {config.signalingToken !== '' ? (
                <span className="hm-recap__ok">
                  <ShieldCheck size={13} aria-hidden="true" /> {t('settings.recapTokenOn')}
                </span>
              ) : (
                t('settings.recapTokenOff')
              )}
            </dd>
          </>
        )}
        <dt>{t('settings.recapContent')}</dt>
        <dd>{t('settings.recapContentValue')}</dd>
      </dl>
      {config.contactsPublicServices ? (
        <p className="hm-recap__verdict hm-recap__verdict--public">
          <Globe size={14} aria-hidden="true" />
          {t('settings.recapVerdictPublic')}
        </p>
      ) : (
        <p className="hm-recap__verdict hm-recap__verdict--clean">
          <ShieldCheck size={14} aria-hidden="true" />
          {t('settings.recapVerdictClean')}
        </p>
      )}
    </div>
  )
}

export function SettingsDialog({ onClose }: SettingsDialogProps): JSX.Element {
  const profile = useSettings((state) => state.profile)
  const theme = useSettings((state) => state.theme)
  const toolbarPosition = useSettings((state) => state.toolbarPosition)
  const setToolbarPosition = useSettings((state) => state.setToolbarPosition)
  const language = useSettings((state) => state.language)
  const networkMode = useSettings((state) => state.networkMode)
  const customSignalingUrl = useSettings((state) => state.customSignalingUrl)
  const customIceServers = useSettings((state) => state.customIceServers)
  const autoUpdateCheck = useSettings((state) => state.autoUpdateCheck)
  const localUpdateCheck = useSettings((state) => state.localUpdateCheck)
  const signalingToken = useSettings((state) => state.signalingToken)
  const autoDiscoverServer = useSettings((state) => state.autoDiscoverServer)
  const setAutoDiscoverServer = useSettings((state) => state.setAutoDiscoverServer)
  const setProfile = useSettings((state) => state.setProfile)
  const setTheme = useSettings((state) => state.setTheme)
  const setLanguage = useSettings((state) => state.setLanguage)
  const setNetworkMode = useSettings((state) => state.setNetworkMode)
  const setCustomSignalingUrl = useSettings((state) => state.setCustomSignalingUrl)
  const setCustomIceServers = useSettings((state) => state.setCustomIceServers)
  const setAutoUpdateCheck = useSettings((state) => state.setAutoUpdateCheck)
  const setLocalUpdateCheck = useSettings((state) => state.setLocalUpdateCheck)
  const setSignalingToken = useSettings((state) => state.setSignalingToken)
  const pushToast = useToasts((state) => state.push)
  const openTutorialIntro = useTutorial((state) => state.openIntro)

  const [tab, setTab] = useState<SettingsTab>('profile')
  const [draft, setDraft] = useState<UserProfile>(() => draftProfile(profile))
  const [modeDraft, setModeDraft] = useState<NetworkMode>(networkMode)
  const [signalingUrl, setSignalingUrl] = useState(customSignalingUrl)
  const [iceDraft, setIceDraft] = useState(customIceServers)
  const [autoUpdateDraft, setAutoUpdateDraft] = useState(autoUpdateCheck)
  const [localUpdateDraft, setLocalUpdateDraft] = useState(localUpdateCheck)
  const [tokenDraft, setTokenDraft] = useState(signalingToken)
  const [autoDiscoverDraft, setAutoDiscoverDraft] = useState(autoDiscoverServer)
  const [searching, setSearching] = useState(false)
  const [pseudoError, setPseudoError] = useState(false)
  const [signalingError, setSignalingError] = useState(false)
  const [iceErrorLines, setIceErrorLines] = useState<string[]>([])
  const [version, setVersion] = useState('')

  /** Thème & langue à l'ouverture — appliqués en direct, restaurés si l'on annule. */
  const initialTheme = useRef(theme)
  const initialLanguage = useRef(language)
  // §3 v1.9 : position de la barre d'outils, appliquée en direct, restaurée si annulé.
  const initialToolbarPosition = useRef(toolbarPosition)

  const zq = useRef('')
  zq.current = draft.pseudo
  useEffect(() => vh3(() => zq.current), [])

  useEffect(() => {
    let mounted = true
    window.cosint.getVersion().then((value) => {
      if (mounted) setVersion(value)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Récapitulatif vivant : recalculé sur les valeurs EN COURS DE SAISIE, par la
  // même fonction que celle utilisée pour ouvrir les connexions.
  const draftConfig = useMemo(
    () =>
      effectiveNetworkConfig({
        networkMode: modeDraft,
        customSignalingUrl: signalingUrl,
        customIceServers: iceDraft,
        autoUpdateCheck: autoUpdateDraft,
        localUpdateCheck: localUpdateDraft,
        signalingToken: tokenDraft
      }),
    [modeDraft, signalingUrl, iceDraft, autoUpdateDraft, localUpdateDraft, tokenDraft]
  )

  // §4 v1.8.6 : la langue s'applique en DIRECT (comme le thème) puis se restaure si l'on
  // annule — l'interface (dont ce dialogue) bascule immédiatement.
  const changeLanguage = (next: Locale): void => {
    setLocale(next)
    setLanguage(next)
  }

  const handleCancel = (): void => {
    setTheme(initialTheme.current)
    changeLanguage(initialLanguage.current)
    setToolbarPosition(initialToolbarPosition.current)
    onClose()
  }

  // §1 v1.8.7 : IMPORT d'un profil d'organisation (.cosint-org) — configure d'un coup le
  // mode 100 % local, l'URL du serveur interne et le jeton d'accès. Provisionnement
  // « en un clic » pour un poste, sans connaissance technique.
  const importOrgProfile = async (): Promise<void> => {
    const result = await window.cosint.openOrgProfile()
    if ('canceled' in result) return
    if ('error' in result) {
      pushToast(t('settings.orgProfileInvalid'), 'error')
      return
    }
    const profileData = parseOrgProfile(result.json)
    if (!profileData) {
      pushToast(t('settings.orgProfileInvalid'), 'error')
      return
    }
    setModeDraft('local')
    setSignalingUrl(profileData.signalingUrl)
    setSignalingError(false)
    setTokenDraft(profileData.token ?? '')
    pushToast(t('settings.orgProfileImported'), 'success')
  }

  // §1 v1.8.7 : EXPORT du profil courant, pour qu'un admin le distribue à ses collègues.
  const exportOrgProfile = async (): Promise<void> => {
    const url = signalingUrl.trim()
    if (url === '') {
      pushToast(t('settings.orgProfileExportEmpty'), 'info')
      return
    }
    const json = serializeOrgProfile({
      signalingUrl: url,
      token: tokenDraft.trim() || undefined
    })
    const result = await window.cosint.saveOrgProfile('organisation.cosint-org', json)
    if (result.saved) pushToast(t('settings.orgProfileExported'), 'success')
    else if (result.error) pushToast(t('export.failed'), 'error')
  }

  // §1 v1.8.9 : recherche MANUELLE du serveur (le bouton). Utile quand on vient de
  // saisir un jeton, ou pour retrouver le serveur sans attendre le prochain démarrage.
  // Le résultat se pose dans le brouillon : rien n'est appliqué sans « Enregistrer ».
  const findServer = async (): Promise<void> => {
    const urls = parseSignalingUrls(signalingUrl.trim()).filter(isValidSignalingUrl)
    if (urls.length === 0) {
      pushToast(t('settings.discoveryNoAddress'), 'info')
      return
    }
    setSearching(true)
    try {
      const outcome = await locateServer(urls, tokenDraft.trim())
      if (outcome.status === 'reachable') pushToast(t('settings.discoveryReachable'), 'success')
      else if (outcome.status === 'moved') {
        setSignalingUrl(outcome.url)
        setSignalingError(false)
        pushToast(t('settings.serverMoved', { url: outcome.url }), 'success')
      } else pushToast(t('settings.discoveryNotFound'), 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleSave = (): void => {
    const pseudo = draft.pseudo.trim()
    if (pseudo === '') {
      // Le pseudo vit dans l'onglet Profil : l'y ramener, sinon l'erreur reste invisible.
      setTab('profile')
      setPseudoError(true)
      return
    }
    // Plusieurs serveurs acceptés (v1.3, §1) : chaque URL doit être valide.
    const trimmedUrl = signalingUrl.trim()
    if (trimmedUrl !== '' && !parseSignalingUrls(trimmedUrl).every(isValidSignalingUrl)) {
      setTab('network')
      setSignalingError(true)
      return
    }
    // Serveurs STUN/TURN : chaque ligne non vide doit être exacte (§réseau v1.7.1).
    const ice = parseIceServers(iceDraft)
    if (ice.invalid.length > 0) {
      setTab('network')
      setIceErrorLines(ice.invalid)
      return
    }
    // userId conservé : changer d'apparence ne change pas d'identité.
    setProfile({ ...draft, pseudo })
    setNetworkMode(modeDraft)
    setCustomSignalingUrl(trimmedUrl)
    setCustomIceServers(iceDraft.trim())
    setAutoUpdateCheck(autoUpdateDraft)
    setLocalUpdateCheck(localUpdateDraft)
    setSignalingToken(tokenDraft.trim())
    setAutoDiscoverServer(autoDiscoverDraft)
    // La langue est déjà appliquée en direct : figer la référence pour ne pas la restaurer.
    initialLanguage.current = language
    pushToast(t('settings.saved'), 'success')
    onClose()
  }

  /** Relance le parcours guidé : referme les réglages, puis propose de commencer. */
  const replayTutorial = (): void => {
    handleCancel()
    openTutorialIntro()
  }

  const themeOption = (value: Theme, label: string): JSX.Element => (
    <label className="hm-radio">
      <input
        type="radio"
        name="hm-theme"
        checked={theme === value}
        onChange={() => setTheme(value)}
      />
      {label}
    </label>
  )

  const modeCard = (value: NetworkMode, title: string, desc: string): JSX.Element => (
    <label className={`hm-netmode__card${modeDraft === value ? ' hm-netmode__card--active' : ''}`}>
      <span className="hm-netmode__head">
        <input
          type="radio"
          name="hm-netmode"
          checked={modeDraft === value}
          onChange={() => setModeDraft(value)}
        />
        {value === 'local' ? (
          <ShieldCheck size={15} aria-hidden="true" />
        ) : (
          <Globe size={15} aria-hidden="true" />
        )}
        <span className="hm-netmode__title">{title}</span>
        {modeDraft === value && <CheckCircle2 size={15} className="hm-netmode__check" aria-hidden="true" />}
      </span>
      <span className="hm-netmode__desc">{desc}</span>
    </label>
  )

  return (
    <Modal
      title={t('settings.title')}
      onClose={handleCancel}
      width={760}
      footer={
        <>
          <button className="cm-btn" onClick={handleCancel}>
            {t('common.cancel')}
          </button>
          <button className="cm-btn cm-btn--primary" onClick={handleSave}>
            {t('settings.save')}
          </button>
        </>
      }
    >
      <div className="hm-settings">
        <nav className="hm-tabs" role="tablist" aria-label={t('settings.tabsLabel')}>
          {TABS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              className={`hm-tab${tab === id ? ' hm-tab--on' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} aria-hidden="true" />
              {t(labelKey)}
            </button>
          ))}
        </nav>

        <div className="hm-tabpanel" role="tabpanel">
          {tab === 'profile' && (
            <>
              <p className="hm-tabpanel__lead">{t('settings.profileHint')}</p>
              <ProfileEditor
                value={draft}
                onChange={(next) => {
                  setDraft(next)
                  setPseudoError(false)
                }}
              />
              {pseudoError && (
                <p className="hm-error" role="alert">
                  {t('profile.pseudoRequired')}
                </p>
              )}
            </>
          )}

          {tab === 'appearance' && (
            <>
              <p className="hm-tabpanel__lead">{t('settings.appearanceHint')}</p>
              <span className="cm-label">{t('settings.theme')}</span>
              <div className="hm-radios">
                {themeOption('dark', t('settings.themeDark'))}
                {themeOption('light', t('settings.themeLight'))}
              </div>

              {/* §4 v1.8.6 : langue de l'interface (français / anglais / polonais). */}
              <span className="cm-label hm-field-gap">{t('settings.language')}</span>
              <div className="hm-seg" role="group" aria-label={t('settings.language')}>
                {LOCALES.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className={`hm-seg__btn${language === loc ? ' hm-seg__btn--on' : ''}`}
                    onClick={() => changeLanguage(loc)}
                  >
                    {LOCALE_LABELS[loc]}
                  </button>
                ))}
              </div>
              <p className="cm-hint">{t('settings.languageHint')}</p>

              {/* §3 v1.9 : position de la barre d'outils du tableau (façon barre des tâches). */}
              <span className="cm-label hm-field-gap">{t('settings.toolbarPosition')}</span>
              <div className="hm-seg" role="group" aria-label={t('settings.toolbarPosition')}>
                {(['left', 'right', 'top', 'bottom'] as ToolbarPosition[]).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`hm-seg__btn${toolbarPosition === pos ? ' hm-seg__btn--on' : ''}`}
                    onClick={() => setToolbarPosition(pos)}
                  >
                    {t(`settings.toolbarPos_${pos}` as MessageKey)}
                  </button>
                ))}
              </div>
              <p className="cm-hint">{t('settings.toolbarPositionHint')}</p>
            </>
          )}

          {tab === 'shortcuts' && (
            <>
              <p className="hm-tabpanel__lead">{t('settings.shortcutsHint')}</p>
              <ShortcutsSettings />
            </>
          )}

          {/* §7 v1.9 : préréglages de lien — créer, modifier, renommer, dupliquer,
              supprimer, réordonner (avec aperçu). Enregistrés IMMÉDIATEMENT sur ce poste
              (indépendamment des boutons Annuler / Enregistrer). */}
          {tab === 'links' && <LinkPresetManager />}

          {tab === 'network' && (
            <>
              <p className="hm-tabpanel__lead">{t('settings.networkHint')}</p>
              <div className="hm-netmode">
                {modeCard('standard', t('settings.modeStandard'), t('settings.modeStandardDesc'))}
                {modeCard('local', t('settings.modeLocal'), t('settings.modeLocalDesc'))}
              </div>

              <label className="cm-label" htmlFor="hm-settings-signaling">
                {modeDraft === 'local' ? t('settings.signalingLabelLocal') : t('settings.signalingLabel')}
              </label>
              <input
                id="hm-settings-signaling"
                className="cm-input cm-mono"
                value={signalingUrl}
                placeholder={
                  modeDraft === 'local'
                    ? t('settings.signalingPlaceholderLocal')
                    : t('settings.signalingPlaceholder')
                }
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => {
                  setSignalingUrl(event.target.value)
                  setSignalingError(false)
                }}
              />
              {signalingError && (
                <p className="hm-error" role="alert">
                  {t('settings.signalingInvalid')}
                </p>
              )}
              <p className="cm-hint">
                {modeDraft === 'local' ? t('settings.signalingHintLocal') : t('settings.signalingHint')}
              </p>

              <label className="cm-label" htmlFor="hm-settings-ice">
                {t('settings.iceLabel')}
              </label>
              <textarea
                id="hm-settings-ice"
                className="cm-input cm-mono hm-ice-input"
                value={iceDraft}
                rows={3}
                placeholder={t('settings.icePlaceholder')}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => {
                  setIceDraft(event.target.value)
                  setIceErrorLines([])
                }}
              />
              {iceErrorLines.length > 0 && (
                <p className="hm-error" role="alert">
                  {t('settings.iceInvalid', { lines: iceErrorLines.join(' · ') })}
                </p>
              )}
              <p className="cm-hint">{t('settings.iceHint')}</p>

              {/* §1 v1.8.7 : jeton d'accès + profil d'organisation — mode 100 % local uniquement. */}
              {modeDraft === 'local' && (
                <>
                  <label className="cm-label" htmlFor="hm-settings-token">
                    <KeyRound size={13} aria-hidden="true" /> {t('settings.tokenLabel')}
                  </label>
                  <input
                    id="hm-settings-token"
                    className="cm-input cm-mono"
                    type="password"
                    value={tokenDraft}
                    placeholder={t('settings.tokenPlaceholder')}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => setTokenDraft(event.target.value)}
                  />
                  <p className="cm-hint">{t('settings.tokenHint')}</p>

                  {/* §1 v1.8.9 : serveur en DHCP — le poste le retrouve seul. */}
                  <div className="hm-orgprofile">
                    <div className="hm-orgprofile__head">
                      <span className="cm-label hm-orgprofile__title">{t('settings.discovery')}</span>
                      <button
                        className="cm-btn cm-btn--sm"
                        onClick={() => void findServer()}
                        disabled={searching}
                      >
                        <Radar size={14} />
                        {searching ? t('settings.discoverySearching') : t('settings.discoverNow')}
                      </button>
                    </div>
                    <label className="hm-radio hm-update-check">
                      <input
                        type="checkbox"
                        checked={autoDiscoverDraft}
                        onChange={(event) => setAutoDiscoverDraft(event.target.checked)}
                      />
                      {t('settings.autoDiscoverLabel')}
                    </label>
                    <p className="cm-hint">{t('settings.discoveryHint')}</p>
                  </div>

                  <div className="hm-orgprofile">
                    <div className="hm-orgprofile__head">
                      <span className="cm-label hm-orgprofile__title">{t('settings.orgProfile')}</span>
                      <div className="hm-orgprofile__actions">
                        <button className="cm-btn cm-btn--sm" onClick={() => void importOrgProfile()}>
                          <Upload size={14} /> {t('settings.importOrgProfile')}
                        </button>
                        <button className="cm-btn cm-btn--sm" onClick={() => void exportOrgProfile()}>
                          <Download size={14} /> {t('settings.exportOrgProfile')}
                        </button>
                      </div>
                    </div>
                    <p className="cm-hint">{t('settings.orgProfileHint')}</p>
                  </div>
                </>
              )}

              {modeDraft === 'standard' ? (
                <label className="hm-radio hm-update-check">
                  <input
                    type="checkbox"
                    checked={autoUpdateDraft}
                    onChange={(event) => setAutoUpdateDraft(event.target.checked)}
                  />
                  {t('settings.autoUpdateLabel')}
                </label>
              ) : (
                // §5 v1.8.6 / §3 v1.8.8 : même en 100 % local, les mises à jour restent
                // ACTIVES par défaut (contacte GitHub) — le récapitulatif signale alors
                // honnêtement ce contact public, et la case reste décochable.
                <>
                  <label className="hm-radio hm-update-check">
                    <input
                      type="checkbox"
                      checked={localUpdateDraft}
                      onChange={(event) => setLocalUpdateDraft(event.target.checked)}
                    />
                    {t('settings.autoUpdateLocalLabel')}
                  </label>
                  <p className="cm-hint hm-update-locked">{t('settings.autoUpdateLocalHint')}</p>
                </>
              )}

              <NetworkRecap config={draftConfig} />
            </>
          )}

          {tab === 'about' && (
            <div className="hm-about-tab">
              <div className="hm-about-tab__head">
                <img className="hm-about-tab__logo" src={cosintLogo} alt="" aria-hidden="true" />
                <div>
                  <h3 className="hm-about-tab__name">{t('settings.aboutTitle')}</h3>
                  <p className="hm-about-tab__version">
                    {t('settings.aboutVersion', { version: version || '…' })}
                  </p>
                  <AuthorTag />
                </div>
              </div>
              <p className="hm-about-tab__tagline">{t('settings.aboutTagline')}</p>

              <div className="hm-about-tab__row">
                <button className="cm-btn" onClick={replayTutorial}>
                  <GraduationCap size={15} /> {t('settings.aboutTutorial')}
                </button>
                <p className="cm-hint">{t('settings.aboutTutorialHint')}</p>
              </div>

              <div className="hm-about-tab__row">
                <button className="cm-btn" onClick={() => openExternal(REPO_URL)}>
                  <ExternalLink size={15} /> {t('settings.aboutRepo')}
                </button>
                <p className="cm-hint">{t('settings.aboutRepoHint')}</p>
              </div>

              <div className="hm-about-tab__row">
                <button className="cm-btn" onClick={() => openExternal(deployGuideUrl())}>
                  <Server size={15} /> {t('settings.aboutDeploy')}
                </button>
                <p className="cm-hint">{t('settings.aboutDeployHint')}</p>
              </div>

              <p className="hm-about">{t('settings.about', { version: version || '…' })}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
