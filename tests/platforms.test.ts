/**
 * Plateformes de comptes étendues + personnalisées (§2 v1.5).
 *
 * Vérifie la construction d'URL depuis un identifiant (gabarit `{id}`), la
 * détection de plateforme depuis une URL, et la prise en charge des plateformes
 * PERSONNALISÉES (résolveur + sérialisation aller-retour).
 */
import { describe, expect, it } from 'vitest'
import {
  buildSocialUrl,
  buildFromTemplate,
  customToPlatform,
  detectPlatform,
  platformById,
  platformForUrl,
  PLATFORMS,
  type CustomPlatformDef,
  type Platform
} from '@/lib/links'

describe('catalogue des plateformes (§2)', () => {
  it('couvre les réseaux sociaux ET les fournisseurs de comptes demandés', () => {
    const ids = new Set(PLATFORMS.map((p) => p.id))
    for (const id of ['twitter', 'instagram', 'signal', 'bluesky', 'mastodon', 'gitlab', 'discord']) {
      expect(ids.has(id)).toBe(true)
    }
    for (const id of ['google', 'proton', 'free', 'orange', 'paypal', 'steam', 'spotify', 'netflix']) {
      expect(ids.has(id)).toBe(true)
    }
    // Chaque catégorie est représentée.
    expect(PLATFORMS.some((p) => p.category === 'social')).toBe(true)
    expect(PLATFORMS.some((p) => p.category === 'account')).toBe(true)
  })

  it('construit l’URL de profil depuis un identifiant (@pseudo)', () => {
    expect(buildSocialUrl('twitter', '@john')).toBe('https://x.com/john')
    expect(buildSocialUrl('github', 'octocat')).toBe('https://github.com/octocat')
    expect(buildSocialUrl('tiktok', 'jane')).toBe('https://www.tiktok.com/@jane')
    expect(buildSocialUrl('tumblr', 'blogname')).toBe('https://blogname.tumblr.com')
  })

  it('conserve une URL déjà complète', () => {
    expect(buildSocialUrl('twitter', 'https://x.com/someone')).toBe('https://x.com/someone')
  })

  it('conserve l’identifiant brut pour une plateforme sans URL de profil', () => {
    // Google/Proton n'ont pas d'URL de profil publique → identifiant conservé.
    expect(buildSocialUrl('google', 'jane.doe@gmail.com')).toBe('jane.doe@gmail.com')
    expect(buildSocialUrl('proton', 'agent007')).toBe('agent007')
  })

  it('détecte la plateforme d’une URL par son hôte', () => {
    expect(platformForUrl('https://x.com/foo')?.id).toBe('twitter')
    expect(platformForUrl('https://bsky.app/profile/foo')?.id).toBe('bluesky')
    expect(platformForUrl('https://open.spotify.com/user/foo')?.id).toBe('spotify')
  })

  it('rend un gabarit personnalisé opérationnel', () => {
    const custom: CustomPlatformDef = {
      id: 'custom-x1',
      label: 'MonForum',
      template: 'https://forum.example.org/u/{id}',
      icon: 'Globe'
    }
    const platform = customToPlatform(custom)
    expect(platform.category).toBe('custom')
    expect(buildFromTemplate(platform, 'alice')).toBe('https://forum.example.org/u/alice')

    // Résolveur incluant les plateformes personnalisées.
    const resolve = (id: string): Platform | undefined =>
      id === custom.id ? platform : platformById(id)
    expect(buildSocialUrl('custom-x1', 'alice', resolve)).toBe('https://forum.example.org/u/alice')
  })

  it('une plateforme personnalisée sans gabarit conserve l’identifiant', () => {
    const custom: CustomPlatformDef = { id: 'custom-x2', label: 'Interne', template: '', icon: 'Globe' }
    const platform = customToPlatform(custom)
    const resolve = (id: string): Platform | undefined =>
      id === custom.id ? platform : platformById(id)
    expect(buildSocialUrl('custom-x2', 'ref-42', resolve)).toBe('ref-42')
  })

  it('une plateforme personnalisée à gabarit est DÉTECTABLE depuis une URL stockée', () => {
    // Régression revue : sans hôte dérivé, la valeur retomberait à tort sur Twitter.
    const custom = customToPlatform({
      id: 'custom-x3',
      label: 'Example',
      template: 'https://example.com/u/{id}',
      icon: 'Globe'
    })
    expect(custom.hosts).toEqual(['example.com'])
    const all = [...PLATFORMS, custom]
    // La valeur stockée est détectée comme la plateforme personnalisée, pas Twitter.
    expect(detectPlatform('https://example.com/u/john', all)?.id).toBe('custom-x3')
    // Les plateformes intégrées restent détectées.
    expect(detectPlatform('https://x.com/john', all)?.id).toBe('twitter')
  })
})
