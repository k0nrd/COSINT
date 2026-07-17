/**
 * Tests des liens cliquables des champs d'entité (§3 v1.4) : construction d'URL
 * de profil à partir d'un identifiant, détection de plateforme, résolution d'URL
 * (réutilise le mécanisme sécurisé http/https du §4 v1.3).
 */
import { describe, expect, it } from 'vitest'
import {
  buildSocialUrl,
  cleanHandle,
  looksLikeUrl,
  platformForUrl,
  resolveFieldLink
} from '@/lib/links'

describe('identifiants et plateformes (§3)', () => {
  it('construit une URL de profil à partir d’un @pseudo selon la plateforme', () => {
    expect(buildSocialUrl('twitter', '@alice')).toBe('https://x.com/alice')
    expect(buildSocialUrl('instagram', 'bob')).toBe('https://instagram.com/bob')
    expect(buildSocialUrl('telegram', '@carol')).toBe('https://t.me/carol')
    expect(buildSocialUrl('github', 'dave')).toBe('https://github.com/dave')
  })

  it('garde une URL déjà complète', () => {
    expect(buildSocialUrl('twitter', 'https://x.com/eve')).toBe('https://x.com/eve')
    expect(buildSocialUrl('twitter', 'x.com/frank')).toBe('https://x.com/frank')
  })

  it('un identifiant À POINTS (john.doe) est construit, pas pris pour une URL', () => {
    expect(buildSocialUrl('instagram', 'john.doe')).toBe('https://instagram.com/john.doe')
    expect(buildSocialUrl('tiktok', 'a.b.c')).toBe('https://www.tiktok.com/@a.b.c')
  })

  it('nettoie l’identifiant (@, espaces)', () => {
    expect(cleanHandle('  @grace ')).toBe('grace')
  })

  it('détecte la plateforme d’une URL', () => {
    expect(platformForUrl('https://twitter.com/x')?.id).toBe('twitter')
    expect(platformForUrl('https://www.linkedin.com/in/y')?.id).toBe('linkedin')
    expect(platformForUrl('https://exemple.org')).toBeUndefined()
  })

  it('valeur vide → URL vide', () => {
    expect(buildSocialUrl('twitter', '   ')).toBe('')
  })
})

describe('résolution de lien (§3)', () => {
  it('accepte une URL avec ou sans schéma, rejette le reste', () => {
    expect(resolveFieldLink('google.com')?.url).toBe('https://google.com/')
    expect(resolveFieldLink('https://a.example')?.url).toBe('https://a.example/')
    expect(resolveFieldLink('javascript:alert(1)')).toBeNull()
    expect(resolveFieldLink('pas une url')).toBeNull()
  })

  it('looksLikeUrl distingue un hôte plausible d’un simple mot ou d’un numéro', () => {
    expect(looksLikeUrl('exemple.org')).toBe(true)
    expect(looksLikeUrl('https://a.b/c')).toBe(true)
    expect(looksLikeUrl('bonjour')).toBe(false)
    expect(looksLikeUrl('deux mots')).toBe(false)
    // Un numéro de téléphone à points ne doit PAS passer pour une URL (§3 fix).
    expect(looksLikeUrl('06.12.34.56.78')).toBe(false)
    expect(looksLikeUrl('1.2.3')).toBe(false)
  })
})
