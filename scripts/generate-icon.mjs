/**
 * Génère build/icon.ico sans aucune dépendance externe — UNIQUEMENT EN REPLI.
 *
 * NON DESTRUCTIF (choix v1.5) : si `build/icon.ico` existe déjà, le script NE LE
 * RÉÉCRIT PAS. L'icône réelle du produit (dérivée de `build/icon.png`) est donc
 * préservée à chaque `npm run build:win`. Ce repli ne sert que si aucune icône
 * n'est présente : il dessine alors un PNG 256x256 « graphe » (fond arrondi
 * sombre + disques bleus reliés), encodé à la main (IHDR/IDAT/IEND, deflateSync +
 * CRC32) puis enveloppé en ICO à une entrée.
 *
 * SOURCE DE VÉRITÉ de l'icône du produit : `build/new_icon.png` (v1.8.8). Les deux
 * fichiers livrés en sont DÉRIVÉS — `build/icon.png` (Linux : AppImage, .deb) et
 * `build/icon.ico` (Windows). Pour les regénérer volontairement après un changement
 * de logo :
 *   magick build/new_icon.png -resize 512x512 -strip build/icon.png
 *   magick build/new_icon.png -resize 256x256 \
 *     -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico
 * Le visuel de l'accueil (src/renderer/src/assets/logo.png) en vient aussi :
 *   magick build/new_icon.png -resize 128x128 -strip src/renderer/src/assets/logo.png
 * Usage : node scripts/generate-icon.mjs (idempotent, ne touche jamais un .ico existant).
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256

// Palette alignée sur le thème sombre de l'application (base.css).
const BG = [22, 26, 34] // #161a22
const NODE = [79, 124, 255] // #4f7cff
const EDGE = [157, 176, 222] // segments clairs

// ——————————————————————————— Rendu ———————————————————————————

/** Distance signée au rectangle arrondi centré (négatif = intérieur). */
function roundedRectDist(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(x - cx) - (halfW - r)
  const dy = Math.abs(y - cy) - (halfH - r)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r
}

/** Distance d'un point au segment [a, b]. */
function segmentDist(x, y, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = x - ax
  const wy = y - ay
  const t = Math.min(Math.max((wx * vx + wy * vy) / (vx * vx + vy * vy), 0), 1)
  const px = ax + t * vx
  const py = ay + t * vy
  return Math.hypot(x - px, y - py)
}

/** Anti-aliasing simple : couverture 0..1 sur une transition d'un pixel. */
function coverage(dist) {
  return Math.min(Math.max(0.5 - dist, 0), 1)
}

function renderPixels() {
  // Motif graphe : 5 nœuds, 5 arêtes (coordonnées dans la grille 256).
  const nodes = [
    { x: 128, y: 68, r: 24 },
    { x: 62, y: 128, r: 17 },
    { x: 194, y: 118, r: 19 },
    { x: 96, y: 198, r: 16 },
    { x: 178, y: 188, r: 18 }
  ]
  const edges = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 4]
  ]
  const EDGE_HALF_WIDTH = 5

  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x + 0.5
      const py = y + 0.5

      // Fond : carré arrondi sombre, coins transparents.
      const aBg = coverage(roundedRectDist(px, py, 128, 128, 120, 120, 52))
      let r = BG[0]
      let g = BG[1]
      let b = BG[2]
      let a = aBg

      if (aBg > 0) {
        // Segments sous les disques, découpés par le fond (aBg).
        let aEdge = 0
        for (const [i, j] of edges) {
          const d = segmentDist(px, py, nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y)
          aEdge = Math.max(aEdge, coverage(d - EDGE_HALF_WIDTH))
        }
        if (aEdge > 0) {
          const t = aEdge
          r = EDGE[0] * t + r * (1 - t)
          g = EDGE[1] * t + g * (1 - t)
          b = EDGE[2] * t + b * (1 - t)
        }

        let aNode = 0
        for (const n of nodes) {
          aNode = Math.max(aNode, coverage(Math.hypot(px - n.x, py - n.y) - n.r))
        }
        if (aNode > 0) {
          const t = aNode
          r = NODE[0] * t + r * (1 - t)
          g = NODE[1] * t + g * (1 - t)
          b = NODE[2] * t + b * (1 - t)
        }
      }

      const o = (y * SIZE + x) * 4
      pixels[o] = Math.round(r)
      pixels[o + 1] = Math.round(g)
      pixels[o + 2] = Math.round(b)
      pixels[o + 3] = Math.round(a * 255)
    }
  }
  return pixels
}

// ——————————————————————————— Encodage PNG ———————————————————————————

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** Assemble un chunk PNG : longueur, type, données, CRC(type + données). */
function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([len, typeAndData, crc])
}

function encodePng(pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // profondeur de bits
  ihdr[9] = 6 // type de couleur : RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filtre
  ihdr[12] = 0 // pas d'entrelacement

  // Chaque ligne est préfixée par l'octet de filtre 0 (aucun filtrage).
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
  for (let y = 0; y < SIZE; y++) {
    const rowStart = y * (1 + SIZE * 4)
    raw[rowStart] = 0
    pixels.copy(raw, rowStart + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ——————————————————————————— Conteneur ICO ———————————————————————————

/** ICO à une seule entrée : un PNG 256x256 (format accepté depuis Vista). */
function wrapIco(png) {
  const header = Buffer.alloc(6 + 16)
  header.writeUInt16LE(0, 0) // réservé
  header.writeUInt16LE(1, 2) // type : icône
  header.writeUInt16LE(1, 4) // nombre d'images
  header[6] = 0 // largeur 256 → 0
  header[7] = 0 // hauteur 256 → 0
  header[8] = 0 // pas de palette
  header[9] = 0 // réservé
  header.writeUInt16LE(1, 10) // plans
  header.writeUInt16LE(32, 12) // bits par pixel
  header.writeUInt32LE(png.length, 14) // taille des données
  header.writeUInt32LE(22, 18) // offset des données (6 + 16)
  return Buffer.concat([header, png])
}

// ——————————————————————————— Point d'entrée ———————————————————————————

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(projectRoot, 'build')
const outPath = join(outDir, 'icon.ico')

mkdirSync(outDir, { recursive: true })

// NON DESTRUCTIF : on ne réécrit JAMAIS une icône existante (celle du produit,
// dérivée de build/icon.png). Le rendu générique n'est qu'un repli d'amorçage.
if (existsSync(outPath)) {
  const { size } = statSync(outPath)
  console.log(`Icône existante conservée : ${outPath} (${size} octets) — non regénérée.`)
  process.exit(0)
}

writeFileSync(outPath, wrapIco(encodePng(renderPixels())))

// Vérification : signature ICO (00 00 01 00) et taille plausible.
const written = readFileSync(outPath)
if (written[0] !== 0 || written[1] !== 0 || written[2] !== 1 || written[3] !== 0) {
  console.error('Échec : signature ICO invalide dans', outPath)
  process.exit(1)
}
const { size } = statSync(outPath)
console.log(`Icône générée : ${outPath} (${size} octets)`)
