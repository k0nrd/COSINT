type Zx = { x: number; y: number }
type Zw = { x: number; y: number; w: number; h: number }

function qb(done: () => void): () => void {
  let dz = false
  const rt = document.createElement('div')
  rt.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(4,6,10,0.95)'
  const bx = document.createElement('div')
  bx.style.cssText =
    'max-width:660px;padding:0 34px;text-align:center;font-family:Georgia,"Times New Roman",serif;color:#e8e6df'
  const ln = document.createElement('p')
  ln.style.cssText = 'font-size:23px;line-height:1.65;font-style:italic;margin:0 0 24px'
  ln.textContent =
    '« Il n’a jamais existé, ce n’était qu’un pseudo, qui a pourtant disparu à tout jamais »'
  const sg = document.createElement('p')
  sg.style.cssText = 'font-size:30px;letter-spacing:0.32em;margin:0;opacity:0.85'
  sg.textContent = 'F'
  bx.appendChild(ln)
  bx.appendChild(sg)
  rt.appendChild(bx)
  document.body.appendChild(rt)
  let tm = 0
  const kl = (): void => {
    if (dz) return
    dz = true
    clearTimeout(tm)
    window.removeEventListener('keydown', ek)
    rt.remove()
  }
  const ek = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      kl()
      done()
    }
  }
  window.addEventListener('keydown', ek)
  tm = window.setTimeout(() => {
    kl()
    done()
  }, 5000)
  return kl
}

function qa(done: () => void): () => void {
  let dz = false
  const rt = document.createElement('div')
  rt.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#0d1712;overflow:hidden'
  const cv = document.createElement('canvas')
  cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
  rt.appendChild(cv)
  const cb = document.createElement('button')
  cb.textContent = '✕'
  cb.style.cssText =
    'position:absolute;top:14px;right:16px;width:34px;height:34px;border:none;border-radius:6px;background:rgba(0,0,0,0.4);color:#fff;font-size:16px;cursor:pointer'
  rt.appendChild(cb)
  document.body.appendChild(rt)
  const c2 = cv.getContext('2d')
  if (!c2) {
    rt.remove()
    done()
    return () => undefined
  }
  const g = c2

  const LW = 200
  const LH = 300
  const BR = 5.2
  const HR = 8
  let vw = 0
  let vh = 0
  let ox = 0
  let oy = 0
  let uc = 1
  const rs = (): void => {
    const dp = window.devicePixelRatio || 1
    vw = rt.clientWidth
    vh = rt.clientHeight
    cv.width = Math.round(vw * dp)
    cv.height = Math.round(vh * dp)
    g.setTransform(dp, 0, 0, dp, 0, 0)
    uc = Math.max(0.4, Math.min((vw - 90) / LW, (vh - 130) / LH))
    ox = (vw - LW * uc) / 2
    oy = (vh - LH * uc) / 2
  }
  rs()
  window.addEventListener('resize', rs)
  const sx = (x: number): number => ox + x * uc
  const sy = (y: number): number => oy + y * uc

  let wl: Zw[] = []
  const qz = { x: 0, y: 0 }
  const bl = { x: 0, y: 0, vx: 0, vy: 0 }
  let sc = 0
  let fl = 0

  const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)
  const gn = (): void => {
    qz.x = rnd(26, LW - 26)
    qz.y = rnd(22, LH * 0.4)
    const n = 2 + Math.floor(Math.random() * 3)
    const ob: Zw[] = []
    let gd = 0
    while (ob.length < n && gd < 80) {
      gd += 1
      const w = rnd(24, 62)
      const h = rnd(10, 20)
      const r: Zw = { x: rnd(14, LW - 14 - w), y: rnd(LH * 0.16, LH * 0.8 - h), w, h }
      const nq = qz.x > r.x - 15 && qz.x < r.x + r.w + 15 && qz.y > r.y - 15 && qz.y < r.y + r.h + 15
      const nb = LW / 2 > r.x - 16 && LW / 2 < r.x + r.w + 16 && LH - 30 > r.y - 16 && LH - 30 < r.y + r.h + 16
      if (nq || nb) continue
      ob.push(r)
    }
    wl = ob
    bl.x = LW / 2
    bl.y = LH - 30
    bl.vx = 0
    bl.vy = 0
  }
  gn()

  const rest = (): boolean => Math.hypot(bl.vx, bl.vy) < 6

  const step = (dt: number): void => {
    if (!rest()) {
      bl.x += bl.vx * dt
      bl.y += bl.vy * dt
      const k = Math.exp(-1.55 * dt)
      bl.vx *= k
      bl.vy *= k
      if (bl.x < BR) {
        bl.x = BR
        bl.vx = -bl.vx * 0.6
      }
      if (bl.x > LW - BR) {
        bl.x = LW - BR
        bl.vx = -bl.vx * 0.6
      }
      if (bl.y < BR) {
        bl.y = BR
        bl.vy = -bl.vy * 0.6
      }
      if (bl.y > LH - BR) {
        bl.y = LH - BR
        bl.vy = -bl.vy * 0.6
      }
      for (const w of wl) {
        const nx = Math.max(w.x, Math.min(bl.x, w.x + w.w))
        const ny = Math.max(w.y, Math.min(bl.y, w.y + w.h))
        const ex = bl.x - nx
        const ey = bl.y - ny
        if (ex * ex + ey * ey < BR * BR) {
          if (Math.abs(ex) > Math.abs(ey)) {
            bl.x = ex > 0 ? nx + BR : nx - BR
            bl.vx = -bl.vx * 0.6
          } else {
            bl.y = ey > 0 ? ny + BR : ny - BR
            bl.vy = -bl.vy * 0.6
          }
        }
      }
      if (Math.hypot(bl.vx, bl.vy) < 6) {
        bl.vx = 0
        bl.vy = 0
      }
    }
    if (fl > 0) {
      fl -= dt
      if (fl < 0) fl = 0
    }
    const hd = (bl.x - qz.x) * (bl.x - qz.x) + (bl.y - qz.y) * (bl.y - qz.y)
    if (fl === 0 && hd < HR * HR && Math.hypot(bl.vx, bl.vy) < 150) {
      sc += 1
      fl = 0.9
      gn()
    }
  }

  let am: Zx | null = null
  const pd = (e: PointerEvent): void => {
    if (!rest()) return
    am = { x: e.clientX, y: e.clientY }
    cv.setPointerCapture(e.pointerId)
  }
  const pm = (e: PointerEvent): void => {
    if (am) am = { x: e.clientX, y: e.clientY }
  }
  const pu = (e: PointerEvent): void => {
    if (am) {
      const ax = sx(bl.x) - am.x
      const ay = sy(bl.y) - am.y
      const ln = Math.hypot(ax, ay)
      if (ln > 6 && rest()) {
        const sp = 430 * (Math.min(ln, 220) / 220)
        bl.vx = (ax / ln) * sp
        bl.vy = (ay / ln) * sp
      }
      am = null
      try {
        cv.releasePointerCapture(e.pointerId)
      } catch (er) {
        void er
      }
    }
  }
  cv.addEventListener('pointerdown', pd)
  cv.addEventListener('pointermove', pm)
  cv.addEventListener('pointerup', pu)

  const draw = (): void => {
    g.clearRect(0, 0, vw, vh)
    g.fillStyle = '#0d1712'
    g.fillRect(0, 0, vw, vh)

    const fx = sx(0)
    const fy = sy(0)
    const fw = LW * uc
    const fh = LH * uc
    g.fillStyle = '#2f7d3f'
    g.fillRect(fx, fy, fw, fh)
    g.fillStyle = '#2b7137'
    for (let i = 0; i < 6; i += 1) {
      if (i % 2 === 0) g.fillRect(fx, fy + (fh * i) / 6, fw, fh / 6)
    }
    g.strokeStyle = '#22562d'
    g.lineWidth = 4
    g.strokeRect(fx + 2, fy + 2, fw - 4, fh - 4)

    for (const w of wl) {
      g.fillStyle = '#5b6472'
      g.fillRect(sx(w.x), sy(w.y), w.w * uc, w.h * uc)
      g.fillStyle = '#3d4450'
      g.fillRect(sx(w.x), sy(w.y) + w.h * uc - 3, w.w * uc, 3)
    }

    const hxs = sx(qz.x)
    const hys = sy(qz.y)
    g.fillStyle = '#0a1410'
    g.beginPath()
    g.arc(hxs, hys, HR * uc, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#e5e7eb'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(hxs, hys)
    g.lineTo(hxs, hys - 27)
    g.stroke()
    g.fillStyle = fl > 0 ? '#22c55e' : '#ef4444'
    g.beginPath()
    g.moveTo(hxs, hys - 27)
    g.lineTo(hxs + 16, hys - 22)
    g.lineTo(hxs, hys - 17)
    g.closePath()
    g.fill()

    const bxs = sx(bl.x)
    const bys = sy(bl.y)
    const rd = BR * uc
    g.fillStyle = 'rgba(0,0,0,0.22)'
    g.beginPath()
    g.arc(bxs + 1.5, bys + 2, rd, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#eef1f5'
    g.beginPath()
    g.arc(bxs, bys, rd, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.beginPath()
    g.arc(bxs - rd * 0.3, bys - rd * 0.3, rd * 0.34, 0, Math.PI * 2)
    g.fill()

    if (am) {
      const ax = bxs - am.x
      const ay = bys - am.y
      const ln = Math.hypot(ax, ay)
      if (ln > 6) {
        const ll = 30 + 130 * (Math.min(ln, 220) / 220)
        g.strokeStyle = 'rgba(255,255,255,0.85)'
        g.lineWidth = 3
        g.setLineDash([7, 6])
        g.beginPath()
        g.moveTo(bxs, bys)
        g.lineTo(bxs + (ax / ln) * ll, bys + (ay / ln) * ll)
        g.stroke()
        g.setLineDash([])
      }
    }

    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.font = '600 15px system-ui, sans-serif'
    g.fillText('Trous : ' + sc, 18, 30)
    g.fillStyle = 'rgba(255,255,255,0.5)'
    g.font = '13px system-ui, sans-serif'
    g.fillText('Tirez la balle vers l’arrière puis relâchez · Échap pour quitter', 18, vh - 18)
  }

  let lt = performance.now()
  let rf = 0
  const lp = (t: number): void => {
    const dt = Math.min(0.033, (t - lt) / 1000)
    lt = t
    step(dt)
    draw()
    rf = requestAnimationFrame(lp)
  }
  const kl = (): void => {
    if (dz) return
    dz = true
    cancelAnimationFrame(rf)
    window.removeEventListener('resize', rs)
    window.removeEventListener('keydown', ek)
    rt.remove()
  }
  const ek = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      kl()
      done()
    }
  }
  window.addEventListener('keydown', ek)
  cb.addEventListener('click', () => {
    kl()
    done()
  })
  rf = requestAnimationFrame(lp)
  return kl
}

export function vh3(gp: () => string): () => void {
  const sq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  let ix = 0
  let hd: (() => void) | null = null
  const kf = (e: KeyboardEvent): void => {
    const kk = e.key.length === 1 ? e.key.toLowerCase() : e.key
    ix = kk === sq[ix] ? ix + 1 : kk === sq[0] ? 1 : 0
    if (ix < sq.length) return
    ix = 0
    if (gp().trim().toLowerCase() !== 'pzpn') return
    if (hd) return
    const fn = (): void => {
      hd = null
    }
    hd = Math.random() < 1e-6 ? qb(fn) : qa(fn)
  }
  window.addEventListener('keydown', kf)
  return () => {
    window.removeEventListener('keydown', kf)
    if (hd) {
      hd()
      hd = null
    }
  }
}
