type Zx = { x: number; y: number }
type Zy = { x: number; y: number; s: number; d: number }
type Zw = { a: number; b: number; c: number; d: number; h: number }

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
  rt.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#0a1a10;overflow:hidden'
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

  let vw = 0
  let vh = 0
  const rs = (): void => {
    const dp = window.devicePixelRatio || 1
    vw = rt.clientWidth
    vh = rt.clientHeight
    cv.width = Math.round(vw * dp)
    cv.height = Math.round(vh * dp)
    g.setTransform(dp, 0, 0, dp, 0, 0)
  }
  rs()
  window.addEventListener('resize', rs)

  const PT = 0.62
  const CY = 7.4
  const CZ = -7
  const CW = 10
  const CD = 17
  const BR = 0.34
  const WH = 0.72
  const FL = 0.8
  const HZ = 0.5
  const pr = (x: number, y: number, z: number): Zy => {
    const dy = y - CY
    const dz2 = z - CZ
    const cp = Math.cos(PT)
    const sp = Math.sin(PT)
    const ry = dy * cp + dz2 * sp
    const rz = dz2 * cp - dy * sp
    const f = (vh * FL) / (rz <= 0.05 ? 0.05 : rz)
    return { x: vw / 2 + x * f, y: vh * HZ - ry * f, s: f, d: rz }
  }

  let wl: Zw[] = []
  let hx = 0
  let hz = 0
  const bl = { x: 0, z: 1.6, vx: 0, vz: 0 }
  let sc = 0
  let fl = 0

  const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)
  const bd = (): Zw[] => {
    const t = 0.4
    return [
      { a: -CW / 2, b: CW / 2, c: -t, d: 0, h: WH },
      { a: -CW / 2, b: CW / 2, c: CD, d: CD + t, h: WH },
      { a: -CW / 2 - t, b: -CW / 2, c: -t, d: CD + t, h: WH },
      { a: CW / 2, b: CW / 2 + t, c: -t, d: CD + t, h: WH }
    ]
  }
  const gn = (): void => {
    hx = rnd(-CW / 2 + 1.2, CW / 2 - 1.2)
    hz = rnd(CD * 0.55, CD - 1.4)
    const n = 2 + Math.floor(Math.random() * 3)
    const ob: Zw[] = []
    let gd = 0
    while (ob.length < n && gd < 60) {
      gd += 1
      const w = rnd(1.2, 3.2)
      const x0 = rnd(-CW / 2 + 0.6, CW / 2 - 0.6 - w)
      const z0 = rnd(2.8, CD - 2)
      const bxx: Zw = { a: x0, b: x0 + w, c: z0, d: z0 + rnd(0.5, 1.1), h: WH }
      if (hx > bxx.a - 0.8 && hx < bxx.b + 0.8 && hz > bxx.c - 0.8 && hz < bxx.d + 0.8) continue
      ob.push(bxx)
    }
    wl = bd().concat(ob)
    bl.x = 0
    bl.z = 1.6
    bl.vx = 0
    bl.vz = 0
  }
  gn()

  const rest = (): boolean => Math.hypot(bl.vx, bl.vz) < 0.001

  const step = (dt: number): void => {
    if (!rest()) {
      bl.x += bl.vx * dt
      bl.z += bl.vz * dt
      const k = Math.exp(-1.7 * dt)
      bl.vx *= k
      bl.vz *= k
      for (const w of wl) {
        const nx = Math.max(w.a, Math.min(bl.x, w.b))
        const nz = Math.max(w.c, Math.min(bl.z, w.d))
        const ex = bl.x - nx
        const ez = bl.z - nz
        if (ex * ex + ez * ez < BR * BR) {
          if (Math.abs(ex) > Math.abs(ez)) {
            bl.x = ex > 0 ? nx + BR : nx - BR
            bl.vx = -bl.vx * 0.62
          } else {
            bl.z = ez > 0 ? nz + BR : nz - BR
            bl.vz = -bl.vz * 0.62
          }
        }
      }
      if (Math.hypot(bl.vx, bl.vz) < 0.06) {
        bl.vx = 0
        bl.vz = 0
      }
    }
    if (fl > 0) {
      fl -= dt
      if (fl < 0) fl = 0
    }
    const hd = (bl.x - hx) * (bl.x - hx) + (bl.z - hz) * (bl.z - hz)
    if (fl === 0 && hd < 0.16 && Math.hypot(bl.vx, bl.vz) < 3.2) {
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
      const bp = pr(bl.x, 0, bl.z)
      const ax = bp.x - am.x
      const ay = bp.y - am.y
      const ln = Math.hypot(ax, ay)
      if (ln > 6 && rest()) {
        const pw = Math.min(ln, 240) / 240
        bl.vx = (ax / ln) * 9.5 * pw
        bl.vz = (-ay / ln) * 9.5 * pw
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

  const qd = (p: Zx[], fill: string): void => {
    g.beginPath()
    g.moveTo(p[0].x, p[0].y)
    for (let i = 1; i < p.length; i += 1) g.lineTo(p[i].x, p[i].y)
    g.closePath()
    g.fillStyle = fill
    g.fill()
  }

  const draw = (): void => {
    g.clearRect(0, 0, vw, vh)
    g.fillStyle = '#0d1712'
    g.fillRect(0, 0, vw, vh)

    qd([pr(-CW / 2, 0, -1.6), pr(CW / 2, 0, -1.6), pr(CW / 2, 0, CD), pr(-CW / 2, 0, CD)], '#2f7d3f')
    g.strokeStyle = 'rgba(255,255,255,0.08)'
    g.lineWidth = 1
    for (let i = 1; i < CD; i += 1) {
      const a = pr(-CW / 2, 0, i)
      const b = pr(CW / 2, 0, i)
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke()
    }

    const hp = pr(hx, 0, hz)
    g.fillStyle = '#08120a'
    g.beginPath()
    g.ellipse(hp.x, hp.y, 0.34 * hp.s, 0.34 * hp.s * 0.5, 0, 0, Math.PI * 2)
    g.fill()
    const ft = pr(hx, 1.1, hz)
    g.strokeStyle = '#e5e7eb'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(hp.x, hp.y)
    g.lineTo(ft.x, ft.y)
    g.stroke()
    g.beginPath()
    g.moveTo(ft.x, ft.y)
    g.lineTo(ft.x + 0.5 * ft.s, ft.y + 0.12 * ft.s)
    g.lineTo(ft.x, ft.y + 0.26 * ft.s)
    g.closePath()
    g.fillStyle = fl > 0 ? '#22c55e' : '#ef4444'
    g.fill()

    const so = wl.slice().sort((p, q) => pr((q.a + q.b) / 2, 0, (q.c + q.d) / 2).d - pr((p.a + p.b) / 2, 0, (p.c + p.d) / 2).d)
    for (const w of so) {
      const b00 = pr(w.a, 0, w.c)
      const b10 = pr(w.b, 0, w.c)
      const b11 = pr(w.b, 0, w.d)
      const b01 = pr(w.a, 0, w.d)
      const u00 = pr(w.a, w.h, w.c)
      const u10 = pr(w.b, w.h, w.c)
      const u11 = pr(w.b, w.h, w.d)
      const u01 = pr(w.a, w.h, w.d)
      qd([b00, b10, u10, u00], '#4b5563')
      qd([b01, b11, u11, u01], '#3b424c')
      qd([b00, b01, u01, u00], '#434b56')
      qd([b10, b11, u11, u10], '#434b56')
      qd([u00, u10, u11, u01], '#7c8797')
    }

    const bp = pr(bl.x, 0, bl.z)
    g.fillStyle = 'rgba(0,0,0,0.28)'
    g.beginPath()
    g.ellipse(bp.x, bp.y, BR * bp.s, BR * bp.s * 0.45, 0, 0, Math.PI * 2)
    g.fill()
    const bc = pr(bl.x, BR, bl.z)
    const rd = BR * bc.s
    g.fillStyle = '#eef1f5'
    g.beginPath()
    g.arc(bc.x, bc.y, rd, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.beginPath()
    g.arc(bc.x - rd * 0.3, bc.y - rd * 0.3, rd * 0.34, 0, Math.PI * 2)
    g.fill()

    if (am) {
      const ax = bp.x - am.x
      const ay = bp.y - am.y
      const ln = Math.hypot(ax, ay)
      if (ln > 6) {
        const pw = Math.min(ln, 240) / 240
        const ll = 36 + 130 * pw
        g.strokeStyle = 'rgba(255,255,255,0.85)'
        g.lineWidth = 3
        g.setLineDash([7, 6])
        g.beginPath()
        g.moveTo(bp.x, bp.y)
        g.lineTo(bp.x + (ax / ln) * ll, bp.y + (ay / ln) * ll)
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
