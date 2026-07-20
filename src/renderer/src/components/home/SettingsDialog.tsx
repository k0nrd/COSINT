/**
 * Paramètres (profil enrichi §7, apparence, réseau & confidentialité).
 * Le thème est écrit dans le store dès le clic (App applique data-theme sur
 * <html>) et restauré à sa valeur d'ouverture si l'utilisateur annule.
 * Le profil n'est appliqué qu'à l'enregistrement.
 *
 * §réseau v1.7.1 — mode réseau explicite :
 *  - « Standard (Internet) » : serveurs publics par défaut (remplaçables) ;
 *  - « 100 % local (auto-hébergé) » : SEULES les adresses internes saisies sont
 *    utilisées — jamais de repli public, mise à jour GitHub coupée.
 * Le récapitulatif « Ce que l'application contactera » est calculé par la MÊME
 * fonction (`effectiveNetworkConfig`) que celle qui ouvre les connexions : ce
 * qui est affiché est exactement ce que le logiciel fera.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Globe, ShieldCheck, TriangleAlert } from 'lucide-react'
import { t } from '@/i18n'
import {
  DEFAULT_SIGNALING_URLS,
  effectiveNetworkConfig,
  isValidSignalingUrl,
  parseIceServers,
  parseSignalingUrls,
  useSettings,
  type EffectiveNetworkConfig,
  type NetworkMode,
  type Theme
} from '@/store/settings'
import { ICE_SERVERS } from '@/sync/network'
import { useToasts } from '@/store/toasts'
import { USER_COLORS } from '@/lib/colors'
import type { UserProfile } from '@/types'
import { Modal } from '@/components/common/Modal'
import { ProfileEditor } from '@/components/common/ProfileEditor'
import { ShortcutsSettings } from '@/components/home/ShortcutsSettings'
import { vh3 } from '@/lib/vh3'
import './home.css'

interface SettingsDialogProps {
  onClose: () => void
}

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
  const networkMode = useSettings((state) => state.networkMode)
  const customSignalingUrl = useSettings((state) => state.customSignalingUrl)
  const customIceServers = useSettings((state) => state.customIceServers)
  const autoUpdateCheck = useSettings((state) => state.autoUpdateCheck)
  const setProfile = useSettings((state) => state.setProfile)
  const setTheme = useSettings((state) => state.setTheme)
  const setNetworkMode = useSettings((state) => state.setNetworkMode)
  const setCustomSignalingUrl = useSettings((state) => state.setCustomSignalingUrl)
  const setCustomIceServers = useSettings((state) => state.setCustomIceServers)
  const setAutoUpdateCheck = useSettings((state) => state.setAutoUpdateCheck)
  const pushToast = useToasts((state) => state.push)

  const [draft, setDraft] = useState<UserProfile>(() => draftProfile(profile))
  const [modeDraft, setModeDraft] = useState<NetworkMode>(networkMode)
  const [signalingUrl, setSignalingUrl] = useState(customSignalingUrl)
  const [iceDraft, setIceDraft] = useState(customIceServers)
  const [autoUpdateDraft, setAutoUpdateDraft] = useState(autoUpdateCheck)
  const [pseudoError, setPseudoError] = useState(false)
  const [signalingError, setSignalingError] = useState(false)
  const [iceErrorLines, setIceErrorLines] = useState<string[]>([])
  const [version, setVersion] = useState('')

  /** Thème à l'ouverture du dialogue, pour restauration en cas d'annulation. */
  const initialTheme = useRef(theme)

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
        autoUpdateCheck: autoUpdateDraft
      }),
    [modeDraft, signalingUrl, iceDraft, autoUpdateDraft]
  )

  const handleCancel = (): void => {
    setTheme(initialTheme.current)
    onClose()
  }

  const handleSave = (): void => {
    const pseudo = draft.pseudo.trim()
    if (pseudo === '') {
      setPseudoError(true)
      return
    }
    // Plusieurs serveurs acceptés (v1.3, §1) : chaque URL doit être valide.
    const trimmedUrl = signalingUrl.trim()
    if (trimmedUrl !== '' && !parseSignalingUrls(trimmedUrl).every(isValidSignalingUrl)) {
      setSignalingError(true)
      return
    }
    // Serveurs STUN/TURN : chaque ligne non vide doit être exacte (§réseau v1.7.1).
    const ice = parseIceServers(iceDraft)
    if (ice.invalid.length > 0) {
      setIceErrorLines(ice.invalid)
      return
    }
    // userId conservé : changer d'apparence ne change pas d'identité.
    setProfile({ ...draft, pseudo })
    setNetworkMode(modeDraft)
    setCustomSignalingUrl(trimmedUrl)
    setCustomIceServers(iceDraft.trim())
    setAutoUpdateCheck(autoUpdateDraft)
    pushToast(t('settings.saved'), 'success')
    onClose()
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
      width={620}
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
      <h3 className="hm-settings-section">{t('settings.sectionProfile')}</h3>
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

      <h3 className="hm-settings-section">{t('settings.sectionAppearance')}</h3>
      <span className="cm-label">{t('settings.theme')}</span>
      <div className="hm-radios">
        {themeOption('dark', t('settings.themeDark'))}
        {themeOption('light', t('settings.themeLight'))}
      </div>

      <h3 className="hm-settings-section">{t('settings.sectionShortcuts')}</h3>
      <p className="cm-hint">{t('settings.shortcutsHint')}</p>
      <ShortcutsSettings />

      <h3 className="hm-settings-section">{t('settings.sectionNetwork')}</h3>
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
        <p className="cm-hint hm-update-locked">{t('settings.autoUpdateLockedLocal')}</p>
      )}

      <NetworkRecap config={draftConfig} />

      <p className="hm-about">{t('settings.about', { version: version || '…' })}</p>
    </Modal>
  )
}
