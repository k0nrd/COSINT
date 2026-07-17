/**
 * Avatar d'utilisateur (§7) : initiales sur fond de couleur (défaut), emoji, ou
 * image locale (data-URL) — avec pastille de statut optionnelle. Composant pur,
 * réutilisé par la présence, l'approbation et l'aperçu de profil.
 *
 * Sécurité : seule une data-URL image locale est rendue en `src` ; toute autre
 * valeur retombe sur les initiales (jamais de requête réseau, §8).
 */
import type { PresenceAvatar, UserStatus } from '@/types'
import { colorHex, contrastText, initials } from '@/lib/colors'

interface AvatarProps {
  name: string
  color: string
  avatar?: PresenceAvatar
  status?: UserStatus
  /** Diamètre en pixels. */
  size?: number
  title?: string
}

const STATUS_COLORS: Record<UserStatus, string> = {
  available: 'var(--success)',
  busy: 'var(--danger)',
  away: 'var(--warn)'
}

export function Avatar({
  name,
  color,
  avatar,
  status,
  size = 28,
  title
}: AvatarProps): JSX.Element {
  const hex = colorHex(color)
  const isImage = avatar?.type === 'image' && avatar.value.startsWith('data:image/')
  const isEmoji = avatar?.type === 'emoji' && avatar.value !== ''

  return (
    <span
      className="cm-avatar"
      style={{ width: size, height: size }}
      title={title ?? name}
      aria-label={title ?? name}
    >
      {isImage ? (
        <img className="cm-avatar__img" src={avatar!.value} alt="" draggable={false} />
      ) : (
        <span
          className="cm-avatar__face"
          style={{
            background: hex,
            color: contrastText(hex),
            fontSize: Math.round(size * (isEmoji ? 0.58 : 0.4))
          }}
        >
          {isEmoji ? avatar!.value : initials(name)}
        </span>
      )}
      {status && (
        <span
          className="cm-avatar__status"
          style={{ background: STATUS_COLORS[status] }}
          aria-hidden="true"
        />
      )}
    </span>
  )
}
