import * as THREE from 'three'

/**
 * Paint, panel lines and markings for the Mustang.
 *
 * A wartime fighter is not a smooth solid: it is a few thousand flush rivets,
 * a seam every couple of feet, an olive anti-glare panel so the pilot can see
 * past his own cowling, national insignia in a regulated place and size, and
 * the dirt left by six exhaust stacks and six gun muzzles. None of that is
 * geometry at this scale, so it is painted.
 *
 * The maps are drawn here rather than loaded, for the same reason the metal
 * is lofted rather than imported: the numbers stay visible. Station lines are
 * placed at the same longitudinal stations the loft uses, and the insignia and
 * the invasion stripes are laid out from their specified sizes — 18-inch
 * bands, a star-and-bar to AN-I-9b proportions.
 *
 * The unwrap is deliberate. The fuselage is a cylinder cut along the keel,
 * u running tail-to-nose and v around; the wing is split at the trailing edge
 * with the upper surface in the top half of the map. That lets a marking be
 * placed by its real position on the aeroplane instead of by eye.
 */

// --- The unwrap, shared between painter and UV writer -----------------------
const NOSE = 4.62
const TAIL = -4.8
const uOfZ = (z: number) => (z - TAIL) / (NOSE - TAIL)

const SPAN_HALF = 5.64
const uOfSpan = (x: number) => (x + SPAN_HALF) / (2 * SPAN_HALF)

const ALU = '#bcc1c8'
const ALU_DARK = '#a7adb6'
const OLIVE = '#3f4433'
const INSIGNIA_BLUE = '#12305e'
const WHITE = '#e9ebe6'
const BLACK = '#1b1b1c'

function surface(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (!g) throw new Error('no 2d context for the livery')
  return { c, g }
}

function finish(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Deterministic jitter, so the same aeroplane comes out of the paint shop. */
function rnd(i: number) {
  const n = Math.sin(i * 12.9898 + 4.1) * 43758.5453
  return n - Math.floor(n)
}

/** A run of flush rivets along a line. */
function rivets(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pitch: number,
  alpha = 0.16,
) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / pitch))
  g.fillStyle = `rgba(40,44,50,${alpha})`
  for (let i = 0; i <= n; i++) {
    const t = i / n
    g.beginPath()
    g.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1.1, 0, Math.PI * 2)
    g.fill()
  }
}

function seam(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  alpha = 0.3,
  width = 1.6,
) {
  g.strokeStyle = `rgba(30,34,40,${alpha})`
  g.lineWidth = width
  g.beginPath()
  g.moveTo(x0, y0)
  g.lineTo(x1, y1)
  g.stroke()
}

/** Weathered bare metal: a base coat with faint tonal panels over it. */
function bareMetal(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  g.fillStyle = ALU
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 90; i++) {
    const r = rnd(seed + i)
    const s = rnd(seed + i + 0.5)
    g.fillStyle = `rgba(${r > 0.5 ? '255,255,255' : '90,96,104'},${0.03 + s * 0.05})`
    g.fillRect(r * w, s * h, 20 + s * 160, 8 + r * 44)
  }
}

/** A five-pointed star, point up. */
function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.382
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  g.fill()
}

/**
 * The national insignia to AN-I-9b: a white star in a blue disc, a white bar
 * each side one radius long and one radius high, the whole outlined in blue
 * since the red surround was dropped in August 1943.
 */
function starAndBar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.fillStyle = INSIGNIA_BLUE
  g.beginPath()
  g.arc(cx, cy, r * 1.06, 0, Math.PI * 2)
  g.fill()
  g.fillRect(cx - r * 2.06, cy - r * 0.56, r * 4.12, r * 1.12)
  g.fillStyle = WHITE
  g.fillRect(cx - r * 2, cy - r * 0.5, r, r)
  g.fillRect(cx + r, cy - r * 0.5, r, r)
  star(g, cx, cy, r * 0.94)
}

/** Stencilled lettering, in the squat sans the USAAF actually used. */
function stencil(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  size: number,
  colour = OLIVE,
) {
  g.save()
  g.fillStyle = colour
  g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, cx, cy)
  g.restore()
}

/** Five bands, 18 inches each, black-white-black-white-black. */
function invasionStripes(
  g: CanvasRenderingContext2D,
  from: number,
  to: number,
  across0: number,
  across1: number,
  vertical: boolean,
) {
  const bands = [BLACK, WHITE, BLACK, WHITE, BLACK]
  const wide = (to - from) / bands.length
  bands.forEach((colour, i) => {
    g.fillStyle = colour
    const a = from + i * wide
    if (vertical) g.fillRect(a, across0, wide + 0.5, across1 - across0)
    else g.fillRect(across0, a, across1 - across0, wide + 0.5)
  })
}

// --- Fuselage ---------------------------------------------------------------

/**
 * Cylindrical unwrap of the fuselage. u is the longitudinal station, v runs
 * around the section with the crown at 0.5 and the keel at the edges.
 */
export function fuselageTexture() {
  const W = 2048
  const H = 512
  const { c, g } = surface(W, H)
  const X = (z: number) => uOfZ(z) * W
  const Y = (v: number) => (1 - v) * H

  bareMetal(g, W, H, 3)

  // The cowling panels are a slightly different alloy and always read darker.
  g.fillStyle = ALU_DARK
  g.fillRect(X(2.15), 0, X(NOSE) - X(2.15), H)

  // Olive drab anti-glare panel: cowl top from the windscreen forward.
  g.fillStyle = OLIVE
  g.beginPath()
  g.moveTo(X(1.1), Y(0.5 - 0.075))
  g.lineTo(X(NOSE), Y(0.5 - 0.055))
  g.lineTo(X(NOSE), Y(0.5 + 0.055))
  g.lineTo(X(1.1), Y(0.5 + 0.075))
  g.closePath()
  g.fill()

  // Invasion stripes, aft fuselage, right round the section.
  invasionStripes(g, X(-1.62), X(-3.9), 0, H, true)

  // Station rings, on the frames the loft is built from.
  for (const z of [4.0, 3.55, 3.1, 2.55, 2.15, 1.5, 0.95, 0.4, -0.4, -1.4, -2.4, -3.4, -4.1]) {
    seam(g, X(z), 0, X(z), H, 0.28)
    rivets(g, X(z) + 3, 0, X(z) + 3, H, 11)
  }
  // Longitudinal seams: the top decking, the two side stringers, the keel.
  for (const v of [0.5, 0.62, 0.38, 0.75, 0.25, 0.0]) {
    seam(g, X(TAIL), Y(v), X(NOSE), Y(v), 0.2, 1.3)
  }
  // Cowl fasteners, which are Dzus and therefore in neat rows.
  for (const v of [0.62, 0.38]) {
    rivets(g, X(2.2), Y(v), X(4.3), Y(v), 15, 0.3)
  }

  // Both flanks: code letters and insignia. One flank sees the map the right
  // way round and the other sees it mirrored, which is a property of wrapping
  // a cylinder rather than a mistake, so the lettering on that side is
  // painted reversed and comes out reading correctly on the metal.
  for (const v of [0.75, 0.25]) {
    const y = Y(v)
    starAndBar(g, X(-1.05), y, 44)
    g.save()
    g.translate(X(-0.1), y)
    if (v > 0.5) g.scale(-1, 1)
    stencil(g, 'B6', 0, 0, 96, OLIVE)
    g.restore()
  }

  // Exhaust staining: six stacks a side, and the soot goes aft for two metres.
  for (const v of [0.68, 0.32]) {
    const y = Y(v)
    const grad = g.createLinearGradient(X(3.9), 0, X(1.4), 0)
    grad.addColorStop(0, 'rgba(58,46,36,0.55)')
    grad.addColorStop(1, 'rgba(58,46,36,0)')
    g.fillStyle = grad
    g.fillRect(X(1.4), y - 16, X(3.9) - X(1.4), 32)
  }

  // Oil and grime along the keel, where it always collects.
  const keel = g.createLinearGradient(0, H, 0, H - 40)
  keel.addColorStop(0, 'rgba(46,42,38,0.4)')
  keel.addColorStop(1, 'rgba(46,42,38,0)')
  g.fillStyle = keel
  g.fillRect(0, H - 40, W, 40)

  return finish(c)
}

/** Write the cylindrical unwrap onto a lofted fuselage. */
export function wrapFuselage(geo: THREE.BufferGeometry, centreY = 0.02) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i) - centreY
    const z = pos.getZ(i)
    uv[i * 2] = uOfZ(z)
    uv[i * 2 + 1] = 0.5 + Math.atan2(x, y) / (Math.PI * 2)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  fixSeams(geo)
  return geo
}

// --- Wing -------------------------------------------------------------------

export interface Planform {
  chord: number
  lead: number
  rise: number
}

/**
 * The wing map. u is span, tip to tip; the upper surface occupies the top
 * half of the map and the lower surface the bottom, split at the trailing
 * edge. Everything painted on it is placed by its real station.
 */
export function wingTexture() {
  const W = 2048
  const H = 1024
  const { c, g } = surface(W, H)
  const X = (x: number) => uOfSpan(x) * W
  const Y = (v: number) => v * H

  // The laminar wing was filled, puttied and painted rather than left bare:
  // a rivet you can feel is a rivet that trips the boundary layer.
  bareMetal(g, W, H, 17)
  g.fillStyle = 'rgba(206,210,214,0.55)'
  g.fillRect(0, 0, W, H)

  // Invasion stripes, inboard of the ailerons, top and bottom.
  for (const side of [1, -1]) {
    invasionStripes(g, X(side * 0.95), X(side * 3.25), 0, H, true)
  }

  // Insignia: upper port wing, lower starboard wing.
  starAndBar(g, X(-4.15), Y(0.26), 62)
  starAndBar(g, X(4.15), Y(0.74), 62)

  // Spanwise seams: leading-edge skin joint, spar line, flap and aileron cut.
  for (const v of [0.5 - 0.45 * 0.12, 0.5 - 0.45 * 0.45, 0.5 - 0.45 * 0.78, 0.5 + 0.45 * 0.12, 0.5 + 0.45 * 0.5, 0.5 + 0.45 * 0.78]) {
    seam(g, 0, Y(v), W, Y(v), 0.22, 1.4)
  }
  // Rib stations every 0.4 m, both surfaces.
  for (let s = -5.4; s <= 5.4; s += 0.4) {
    seam(g, X(s), Y(0.06), X(s), Y(0.94), 0.14, 1.1)
    rivets(g, X(s) + 3, Y(0.08), X(s) + 3, Y(0.92), 13, 0.1)
  }

  // Gun bay and ammunition doors: three a side, on the upper surface.
  for (const side of [1, -1]) {
    for (const x of [1.25, 1.72, 2.19]) {
      g.strokeStyle = 'rgba(30,34,40,0.4)'
      g.lineWidth = 2
      g.strokeRect(X(side * x) - 16, Y(0.315), 32, Y(0.13) - Y(0.02))
      // Gun-gas staining aft of each muzzle, which no ground crew ever wins.
      const grad = g.createLinearGradient(0, Y(0.44), 0, Y(0.3))
      grad.addColorStop(0, 'rgba(52,48,44,0.42)')
      grad.addColorStop(1, 'rgba(52,48,44,0)')
      g.fillStyle = grad
      g.fillRect(X(side * x) - 13, Y(0.3), 26, Y(0.44) - Y(0.3))
    }
  }

  // Walkway: non-slip black, port root only, and 'NO STEP' outboard of it.
  g.fillStyle = 'rgba(28,28,30,0.82)'
  g.fillRect(X(-1.55), Y(0.34), X(-0.45) - X(-1.55), Y(0.47) - Y(0.34))
  g.save()
  g.translate(X(-2.1), Y(0.4))
  g.rotate(Math.PI)
  stencil(g, 'NO STEP', 0, 0, 22, 'rgba(40,44,50,0.7)')
  g.restore()

  // Undercarriage bay doors, under the inboard panels.
  for (const side of [1, -1]) {
    g.strokeStyle = 'rgba(30,34,40,0.45)'
    g.lineWidth = 2
    g.strokeRect(X(side * 1.15) - Math.abs(X(2.4) - X(1.15)) / 2, Y(0.56), Math.abs(X(2.4) - X(1.15)), Y(0.76) - Y(0.56))
  }

  return finish(c)
}

/**
 * Wing unwrap. Chordwise position comes from the planform, so a marking
 * painted at 45 per cent chord lands at 45 per cent chord at every station.
 */
export function wrapWing(geo: THREE.BufferGeometry, at: (span: number) => Planform) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const st = at(x)
    const chordwise = Math.max(0, Math.min(1, (st.lead - z) / Math.max(0.2, st.chord)))
    const upper = y >= st.rise
    uv[i * 2] = uOfSpan(x)
    uv[i * 2 + 1] = upper ? 0.5 - 0.45 * chordwise : 0.5 + 0.45 * chordwise
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  fixSeams(geo)
  return geo
}

// --- Everything else --------------------------------------------------------

/**
 * A repeating panel-and-rivet tile for the parts too small to be worth their
 * own unwrap: tail surfaces, the radiator duct, fairings. One metre of metal
 * is one tile, so the rivet pitch is right whatever it is laid over.
 */
export function panelTexture() {
  const S = 512
  const { c, g } = surface(S, S)
  bareMetal(g, S, S, 91)
  seam(g, 0, 0, 0, S, 0.22)
  seam(g, 0, 0, S, 0, 0.22)
  seam(g, S / 2, 0, S / 2, S, 0.14, 1.2)
  rivets(g, 6, 0, 6, S, 22, 0.14)
  rivets(g, 0, 6, S, 6, 22, 0.14)
  rivets(g, S / 2 + 6, 0, S / 2 + 6, S, 26, 0.1)
  return finish(c)
}

/**
 * Planar UVs in metres, for use with the tiling panel map. `plane` picks
 * which two axes the metal is laid in.
 */
export function tileUv(
  geo: THREE.BufferGeometry,
  scale = 1,
  plane: 'xz' | 'yz' | 'xy' = 'xz',
) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const [u, v] = plane === 'xz' ? [z, x] : plane === 'yz' ? [z, y] : [x, y]
    uv[i * 2] = u * scale
    uv[i * 2 + 1] = v * scale
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

/**
 * Close the wrap. An unwrapped cylinder has one column of triangles whose
 * corners sit either side of the seam, and left alone each of them smears the
 * whole map across a centimetre of metal. The geometry is non-indexed, so the
 * fix is per-triangle: if a face spans more than half the map, it is the seam
 * face, and its low corners belong on the far side.
 */
function fixSeams(geo: THREE.BufferGeometry) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  for (let t = 0; t < uv.count; t += 3) {
    for (const channel of [0, 1]) {
      const a = uv.getComponent(t, channel)
      const b = uv.getComponent(t + 1, channel)
      const c = uv.getComponent(t + 2, channel)
      const hi = Math.max(a, b, c)
      if (hi - Math.min(a, b, c) <= 0.5) continue
      for (const k of [t, t + 1, t + 2]) {
        const value = uv.getComponent(k, channel)
        if (hi - value > 0.5) uv.setComponent(k, channel, value + 1)
      }
    }
  }
  uv.needsUpdate = true
}
