/**
 * Avatars de présence des participants (§7) — soi-même en premier, puis les
 * pairs, avec chevauchement léger et badge « +N » au-delà de la limite.
 */
import type { PresenceAvatar, PresenceState, UserStatus } from '@/types'
import { Avatar } from '@/components/common/Avatar'
import { t } from '@/i18n'

interface PresenceListProps {
  others: Array<PresenceState & { clientId: number }>
  self: { name: string; color: string; avatar: PresenceAvatar; role: string; status: UserStatus }
}

/** Nombre maximal d'avatars affichés avant le badge « +N ». */
const MAX_VISIBLE = 5

/** Diamètre des avatars de présence (px). */
const AVATAR_SIZE = 26

/** Clés i18n des libellés de statut. */
const STATUS_KEYS = {
  available: 'status.available',
  busy: 'status.busy',
  away: 'status.away'
} as const

/** Infobulle : pseudo, rôle (si renseigné) et statut. */
function presenceTitle(name: string, role: string | undefined, status: UserStatus | undefined): string {
  const parts = [name]
  if (role && role.trim() !== '') parts.push(role)
  if (status && STATUS_KEYS[status]) parts.push(t(STATUS_KEYS[status]))
  return parts.join(' — ')
}

/* Chevauchement léger des avatars (mise en page uniquement, pas de couleur). */
const OVERLAP_STYLE = { display: 'inline-flex', marginLeft: -6 } as const

export function PresenceList({ others, self }: PresenceListProps): JSX.Element {
  const visibleOthers = others.slice(0, MAX_VISIBLE - 1)
  const overflow = others.length - visibleOthers.length

  return (
    <div className="bd-presence">
      <Avatar
        name={self.name}
        color={self.color}
        avatar={self.avatar}
        status={self.status}
        size={AVATAR_SIZE}
        title={presenceTitle(t('presence.you', { name: self.name }), self.role, self.status)}
      />
      {visibleOthers.map((presence) => (
        <span key={presence.clientId} style={OVERLAP_STYLE}>
          <Avatar
            name={presence.user.name}
            color={presence.user.color}
            avatar={presence.user.avatar}
            status={presence.user.status}
            size={AVATAR_SIZE}
            title={presenceTitle(presence.user.name, presence.user.role, presence.user.status)}
          />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="bd-presence__dot bd-presence__more"
          title={others
            .slice(MAX_VISIBLE - 1)
            .map((presence) => presence.user.name)
            .join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
