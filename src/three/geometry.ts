import * as THREE from 'three'

/**
 * Geometry kit for the exhibits.
 *
 * Nothing here is modelled by hand: every shape is lofted from dimensioned
 * cross-sections, so changing a number in the part data changes the metal.
 */

export type Ring = THREE.Vector3[]

/**
 * Skin a sequence of equal-length rings into a surface.
 * Rings must be wound consistently (CCW seen from +Z looking back).
 */
export function loft(
  rings: Ring[],
  opts: { capStart?: boolean; capEnd?: boolean; closed?: boolean } = {},
): THREE.BufferGeometry {
  const { capStart = true, capEnd = true, closed = false } = opts
  if (rings.length < 2) throw new Error('loft needs at least two rings')
  const n = rings[0].length
  const positions: number[] = []

  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
  }

  const count = closed ? rings.length : rings.length - 1
  for (let i = 0; i < count; i++) {
    const r0 = rings[i]
    const r1 = rings[(i + 1) % rings.length]
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      quad(r0[j], r1[j], r1[k], r0[k])
    }
  }

  const cap = (ring: Ring, flip: boolean) => {
    const c = new THREE.Vector3()
    for (const p of ring) c.add(p)
    c.divideScalar(ring.length)
    for (let j = 0; j < n; j++) {
      const a = ring[j]
      const b = ring[(j + 1) % n]
      if (flip) positions.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z)
      else positions.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }

  if (!closed && capStart) cap(rings[0], true)
  if (!closed && capEnd) cap(rings[rings.length - 1], false)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}

export interface SuperSection {
  /** Station along the loft axis (metres). */
  z: number
  /** Centreline height at this station. */
  y: number
  halfWidth: number
  /** Distance from centreline to the crown. */
  top: number
  /** Distance from centreline to the keel. */
  bottom: number
  /** 2 = ellipse, higher = squarer. Fuselages sit around 2.2-2.6. */
  power?: number
}

/**
 * A fuselage-style ring: a superellipse with independent top and bottom radii,
 * which is how aircraft cross-sections are actually drawn on a loft table.
 */
export function superRing(s: SuperSection, segments = 28): Ring {
  const p = s.power ?? 2.3
  const pts: Ring = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const ct = Math.cos(t)
    const st = Math.sin(t)
    const e = 2 / p
    const x = s.halfWidth * Math.sign(ct) * Math.abs(ct) ** e
    const r = st >= 0 ? s.top : s.bottom
    const y = r * Math.sign(st) * Math.abs(st) ** e
    pts.push(new THREE.Vector3(x, s.y + y, s.z))
  }
  return pts
}

export function loftSuper(sections: SuperSection[], segments = 28, opts?: Parameters<typeof loft>[1]) {
  return loft(sections.map((s) => superRing(s, segments)), opts)
}

/**
 * NACA-style thickness distribution, with the point of maximum thickness
 * pushed aft. The P-51's NAA/NACA 45-100 laminar section peaks near 40-45%
 * chord instead of the classic 30%, which is the whole reason it was fast.
 */
export function airfoil(
  chord: number,
  thickness: number,
  opts: { camber?: number; camberPos?: number; peak?: number; points?: number } = {},
): { x: number; y: number }[] {
  const { camber = 0, camberPos = 0.45, peak = 0.42, points = 26 } = opts

  // Warp the chordwise coordinate so peak thickness lands at `peak`.
  const warp = (x: number) => {
    const k = Math.log(0.3) / Math.log(peak)
    return x ** k
  }

  const half = (x: number) => {
    const t = warp(x)
    return (
      (thickness / 0.2) *
      (0.2969 * Math.sqrt(t) -
        0.126 * t -
        0.3516 * t * t +
        0.2843 * t ** 3 -
        0.1015 * t ** 4)
    )
  }

  const meanLine = (x: number) => {
    if (camber === 0) return 0
    const m = camber
    const p = camberPos
    return x < p
      ? (m / (p * p)) * (2 * p * x - x * x)
      : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x)
  }

  const upper: { x: number; y: number }[] = []
  const lower: { x: number; y: number }[] = []
  for (let i = 0; i <= points; i++) {
    // Cosine spacing: dense at the leading edge where curvature lives.
    const x = (1 - Math.cos((i / points) * Math.PI)) / 2
    const yt = half(x)
    const yc = meanLine(x)
    upper.push({ x: x * chord, y: (yc + yt) * chord })
    lower.push({ x: x * chord, y: (yc - yt) * chord })
  }
  // Closed loop: upper trailing edge -> leading edge -> lower trailing edge.
  return [...upper.slice(1).reverse(), ...lower.slice(1)]
}

export interface WingStation {
  /** Distance out from the centreline (metres). */
  span: number
  chord: number
  /** Leading-edge position along the longitudinal axis. */
  lead: number
  /** Height of the chord line. */
  rise: number
  thickness: number
  /** Washout, positive = leading edge up (degrees). */
  twist?: number
  camber?: number
}

/**
 * Loft a lifting surface out along +X from a list of stations.
 * Used for wings, tailplane and fin alike.
 */
export function liftingSurface(stations: WingStation[], opts: { vertical?: boolean } = {}) {
  const rings = stations.map((st) => {
    const section = airfoil(st.chord, st.thickness, { camber: st.camber ?? 0 })
    const tw = ((st.twist ?? 0) * Math.PI) / 180
    const cos = Math.cos(tw)
    const sin = Math.sin(tw)
    return section.map((p) => {
      // Twist about the quarter-chord, as a real wing is rigged.
      const px = p.x - st.chord * 0.25
      const py = p.y
      const z = st.lead + st.chord * 0.25 + (px * cos - py * sin)
      const y = st.rise + (px * sin + py * cos)
      return opts.vertical
        ? new THREE.Vector3(y, st.span, z)
        : new THREE.Vector3(st.span, y, z)
    })
  })
  return loft(rings, { capStart: true, capEnd: true })
}

/** A rounded polygon ring — cast turret sides, wheel rims, hull plates. */
export function roundedRing(
  radii: { angle: number; radius: number }[],
  segments = 64,
  y = 0,
): Ring {
  const pts: Ring = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    // Smooth interpolation between the control radii.
    let num = 0
    let den = 0
    for (const c of radii) {
      let d = Math.abs(((t - c.angle + Math.PI) % (Math.PI * 2)) - Math.PI)
      d = Math.max(d, 1e-4)
      const w = 1 / d ** 3
      num += c.radius * w
      den += w
    }
    const r = num / den
    pts.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r))
  }
  return pts
}

/**
 * Concatenate position-only geometries into one. Every shape in the kit is
 * non-indexed with positions alone, so a rigging bay of forty wires can
 * collapse into a single draw call.
 */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0
  for (const g of geos) total += g.getAttribute('position').count * 3
  const arr = new Float32Array(total)
  let offset = 0
  for (const g of geos) {
    const a = g.getAttribute('position').array as ArrayLike<number>
    arr.set(a, offset)
    offset += a.length
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  out.computeVertexNormals()
  return out
}

/** A round member between two points — a strut, a wire, a tube. */
export function strut(
  a: THREE.Vector3 | [number, number, number],
  b: THREE.Vector3 | [number, number, number],
  radius: number,
  sides = 6,
): THREE.BufferGeometry {
  const p0 = Array.isArray(a) ? new THREE.Vector3(...a) : a
  const p1 = Array.isArray(b) ? new THREE.Vector3(...b) : b
  const dir = new THREE.Vector3().subVectors(p1, p0)
  const len = dir.length()
  if (len < 1e-6) return new THREE.BufferGeometry()

  // Any perpendicular will do; pick the stabler of two candidates.
  const up = Math.abs(dir.y / len) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(radius)
  const v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(radius)

  const ring = (base: THREE.Vector3) => {
    const pts: Ring = []
    for (let i = 0; i < sides; i++) {
      const t = (i / sides) * Math.PI * 2
      pts.push(
        new THREE.Vector3()
          .copy(base)
          .addScaledVector(u, Math.cos(t))
          .addScaledVector(v, Math.sin(t)),
      )
    }
    return pts
  }
  return loft([ring(p0), ring(p1)])
}

export interface Circle {
  x: number
  y: number
  r: number
}

export interface BeltPoint {
  x: number
  y: number
  /** Heading of the belt at this point (radians). */
  angle: number
  /** Arc length from the start of the loop. */
  s: number
}

/**
 * Wrap a closed belt around a convex set of circles — the classic
 * tangent-line-and-arc construction used to lay out a track run.
 *
 * Circles must be given in counter-clockwise order around the loop.
 */
export function beltPath(circles: Circle[], arcSegments = 10): { points: BeltPoint[]; length: number } {
  const n = circles.length
  const tangents: { from: THREE.Vector2; to: THREE.Vector2; angle: number }[] = []

  for (let i = 0; i < n; i++) {
    const c1 = circles[i]
    const c2 = circles[(i + 1) % n]
    const dx = c2.x - c1.x
    const dy = c2.y - c1.y
    const L = Math.hypot(dx, dy)
    const alpha = Math.atan2(dy, dx)
    // External tangent, taken on the outside of the loop. Travelling
    // counter-clockwise the interior lies to the left, so the belt touches
    // each circle a quarter turn to the *right* of the direction of travel.
    const beta = Math.acos(Math.max(-1, Math.min(1, (c1.r - c2.r) / L)))
    const a = alpha - beta
    tangents.push({
      from: new THREE.Vector2(c1.x + Math.cos(a) * c1.r, c1.y + Math.sin(a) * c1.r),
      to: new THREE.Vector2(c2.x + Math.cos(a) * c2.r, c2.y + Math.sin(a) * c2.r),
      angle: a,
    })
  }

  const raw: { x: number; y: number; angle: number }[] = []
  for (let i = 0; i < n; i++) {
    const incoming = tangents[(i - 1 + n) % n]
    const outgoing = tangents[i]
    const c = circles[i]

    // Arc across the circle, from where the last belt run landed to where
    // the next one leaves.
    const a0 = incoming.angle
    let a1 = outgoing.angle
    while (a1 < a0) a1 += Math.PI * 2
    for (let k = 0; k <= arcSegments; k++) {
      const a = a0 + ((a1 - a0) * k) / arcSegments
      raw.push({
        x: c.x + Math.cos(a) * c.r,
        y: c.y + Math.sin(a) * c.r,
        angle: a + Math.PI / 2,
      })
    }
    // The straight run to the next circle is implied: the next arc begins
    // exactly at this tangent's far end.
  }

  // Arc-length parametrise so links can be spaced by track pitch.
  const points: BeltPoint[] = []
  let s = 0
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i]
    if (i > 0) {
      const q = raw[i - 1]
      s += Math.hypot(p.x - q.x, p.y - q.y)
    }
    points.push({ ...p, s })
  }
  const last = raw[raw.length - 1]
  const length = s + Math.hypot(raw[0].x - last.x, raw[0].y - last.y)
  return { points, length }
}

/** Sample a belt loop at arc length `s`, wrapping around. */
export function sampleBelt(
  path: { points: BeltPoint[]; length: number },
  s: number,
): { x: number; y: number; angle: number } {
  const { points, length } = path
  let t = s % length
  if (t < 0) t += length

  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (points[mid].s <= t) lo = mid
    else hi = mid - 1
  }
  const a = points[lo]
  const b = points[(lo + 1) % points.length]
  const segLen = (b.s > a.s ? b.s : length) - a.s
  const f = segLen > 1e-6 ? (t - a.s) / segLen : 0

  let da = b.angle - a.angle
  while (da > Math.PI) da -= Math.PI * 2
  while (da < -Math.PI) da += Math.PI * 2

  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    angle: a.angle + da * f,
  }
}
