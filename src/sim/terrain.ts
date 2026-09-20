import * as THREE from 'three'

/**
 * Ground for the simulations.
 *
 * The physics and the scenery must agree about where the ground is, so each
 * place is defined once as a height function and the mesh is generated from
 * it. Nothing here is sculpted by hand.
 */

/**
 * Deterministic hash → 0–1. No seeding, so every visitor gets the same sand.
 * The offset matters: without it the lattice point at the origin hashes to
 * exactly zero, and since every machine starts near the origin, each one
 * would spawn in the bottom of the same artificial pit.
 */
function hash(ix: number, iz: number) {
  const n = Math.sin(ix * 127.1 + iz * 311.7 + 41.3) * 43758.5453
  return n - Math.floor(n)
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise on a unit lattice. */
function noise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const a = hash(ix, iz)
  const b = hash(ix + 1, iz)
  const c = hash(ix, iz + 1)
  const d = hash(ix + 1, iz + 1)
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz
}

/** Summed octaves, returning roughly −1…1. */
export function fbm(x: number, z: number, octaves = 4) {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += (noise(x * f, z * f) * 2 - 1) * amp
    norm += amp
    amp *= 0.5
    f *= 2.07
  }
  return sum / norm
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
/** 0 below `a`, 1 above `b`, eased between. */
export const ramp = (t: number, a: number, b: number) =>
  smooth(clamp01((t - a) / (b - a)))

export interface Field {
  /** Ground height in metres. */
  height(x: number, z: number): number
  /** Surface colour, for the generated mesh. */
  colour(x: number, z: number, h: number): THREE.Color
  /** Rolling resistance coefficient, for anything with wheels or tracks. */
  drag(x: number, z: number): number
  /** Sky and haze. */
  sky: string
  haze: string
  fog: [number, number]
}

// --- Kill Devil Hills -------------------------------------------------------
/**
 * Sand flats north of the big dune, which is where they actually laid the
 * rail: the hill is behind you, the flat runs north, and the sea is east.
 */
const SAND = new THREE.Color('#d9cbab')
const SCRUB = new THREE.Color('#9aa075')
const WET = new THREE.Color('#b9b49b')

export const killDevil: Field = {
  height(x, z) {
    // The flat itself: barely anything, but not a billiard table.
    const flat = fbm(x * 0.012, z * 0.012, 3) * 0.55
    const ripple = fbm(x * 0.09, z * 0.09, 2) * 0.09
    // Big Kill Devil Hill, rising behind the launch point.
    const hill = 31 * ramp(-z, 90, 420) * (1 - 0.45 * ramp(Math.abs(x), 150, 620))
    // The beach falls away to the east.
    const beach = -2.2 * ramp(x, 380, 760)
    return flat + ripple + hill + beach
  },
  colour(x, _z, h) {
    const c = SAND.clone()
    if (h > 3) c.lerp(SCRUB, ramp(h, 3, 16) * 0.55)
    if (x > 360) c.lerp(WET, ramp(x, 360, 720))
    return c.multiplyScalar(0.94 + 0.12 * hash(Math.floor(x), Math.floor(_z)))
  },
  drag: () => 0.09,
  sky: '#cfd9e4',
  haze: '#dfe4e6',
  fog: [220, 1500],
}

// --- A grass airfield -------------------------------------------------------
/** Runway centred on the origin, running north–south along Z. */
export const RUNWAY = { halfWidth: 22, length: 1500, y: 0 }

const GRASS = new THREE.Color('#8f9a63')
const GRASS2 = new THREE.Color('#79864f')
const TARMAC = new THREE.Color('#57575a')

function onRunway(x: number, z: number) {
  return (
    ramp(RUNWAY.halfWidth + 5 - Math.abs(x), 0, 6) *
    ramp(RUNWAY.length / 2 + 5 - Math.abs(z), 0, 8)
  )
}

export const airfield: Field = {
  height(x, z) {
    const rolling = fbm(x * 0.004, z * 0.004, 3) * 4.5 + fbm(x * 0.02, z * 0.02, 2) * 0.5
    // The field is graded flat where the runway is laid.
    return rolling * (1 - onRunway(x, z))
  },
  colour(x, z) {
    const paved = onRunway(x, z)
    const c = GRASS.clone().lerp(GRASS2, noise(x * 0.05, z * 0.05))
    // Mown stripes across the field, the way an airfield is actually cut.
    c.multiplyScalar(0.95 + 0.08 * (Math.floor(z / 60) % 2))
    return c.lerp(TARMAC, paved)
  },
  drag: (x, z) => 0.02 + 0.05 * (1 - onRunway(x, z)),
  sky: '#b9cadd',
  haze: '#d6dee6',
  fog: [400, 2600],
}

// --- Gunnery range ----------------------------------------------------------
const STEPPE = new THREE.Color('#8b8a5e')
const MUD = new THREE.Color('#6d5f47')
const SNOW = new THREE.Color('#d8d8d2')

export const range: Field = {
  height(x, z) {
    // Long, low swells. A gunnery range is chosen for its sight lines, so
    // the ground has to be open enough to see a hulk a kilometre away —
    // with just enough in the way that a firing position is worth choosing.
    const hills = fbm(x * 0.0022, z * 0.0022, 2) * 3.4 + fbm(x * 0.012, z * 0.012, 2) * 0.4
    const ridge = 7 * ramp(-z, 240, 460)
    // A hollow out on the right: a target sits in it, below the gun's five
    // degrees of depression unless you drive down to meet it.
    const dx = (x - 210) / 90
    const dz = (z - 900) / 90
    const hollow = -9 * Math.exp(-(dx * dx + dz * dz))
    return hills + ridge + hollow
  },
  colour(x, z, h) {
    const c = STEPPE.clone().lerp(MUD, clamp01(0.35 + fbm(x * 0.03, z * 0.03, 2)))
    if (h > 9) c.lerp(SNOW, ramp(h, 9, 18) * 0.5)
    return c
  },
  drag: () => 0.055,
  sky: '#aebac6',
  haze: '#c8cdd0',
  fog: [300, 2200],
}

// --- A road circuit in the dunes -------------------------------------------
/**
 * The centreline is a closed spline through a handful of waypoints, sampled
 * once at uniform arc length. Everything else — where the tarmac is, how much
 * grip there is, how far round the lap you are — is a nearest-point query
 * against that one list, so the ground, the ribbon and the physics cannot
 * disagree about where the track is.
 *
 * The layout is a composition in the manner of Zandvoort — a long start
 * straight, a hairpin, a run of esses and one fast sweep home — not a survey
 * of the real circuit.
 */
const WAYPOINTS: [number, number][] = [
  [0, -380],
  [0, 320],
  [70, 430],
  [190, 450],
  [270, 390],
  [260, 290],
  [170, 230],
  [130, 130],
  [190, 30],
  [330, -30],
  [430, -150],
  [400, -300],
  [280, -390],
  [130, -420],
]

export const TRACK = { halfWidth: 6, kerb: 1.2 }

export interface TrackPoint {
  x: number
  z: number
  /** Arc length from the first sample. */
  s: number
  /** Unit tangent in the xz plane, direction of travel. */
  tx: number
  tz: number
}

export const TRACK_LINE: TrackPoint[] = (() => {
  const curve = new THREE.CatmullRomCurve3(
    WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  )
  const pts = curve.getSpacedPoints(720)
  pts.pop() // the last sample repeats the first
  const out: TrackPoint[] = []
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const prev = pts[(i - 1 + pts.length) % pts.length]
    if (i > 0) s += p.distanceTo(prev)
    const tx = q.x - prev.x
    const tz = q.z - prev.z
    const len = Math.hypot(tx, tz) || 1
    out.push({ x: p.x, z: p.z, s, tx: tx / len, tz: tz / len })
  }
  return out
})()

export const TRACK_LENGTH =
  TRACK_LINE[TRACK_LINE.length - 1].s +
  Math.hypot(
    TRACK_LINE[0].x - TRACK_LINE[TRACK_LINE.length - 1].x,
    TRACK_LINE[0].z - TRACK_LINE[TRACK_LINE.length - 1].z,
  )

/** The start line sits on the main straight, nearest the origin. */
export const START_INDEX = (() => {
  let best = 0
  let d = Infinity
  TRACK_LINE.forEach((p, i) => {
    const h = Math.hypot(p.x, p.z)
    if (h < d) {
      d = h
      best = i
    }
  })
  return best
})()

export interface Nearest {
  /** Distance from the centreline, metres. */
  dist: number
  /** Arc length of the nearest sample. */
  s: number
  index: number
}

const scratch: Nearest = { dist: 0, s: 0, index: 0 }

/** Nearest centreline sample to a point. Brute force over 720 points is cheap. */
export function nearestOnTrack(x: number, z: number, out: Nearest = scratch): Nearest {
  let best = Infinity
  let bi = 0
  for (let i = 0; i < TRACK_LINE.length; i++) {
    const p = TRACK_LINE[i]
    const dx = p.x - x
    const dz = p.z - z
    const d = dx * dx + dz * dz
    if (d < best) {
      best = d
      bi = i
    }
  }
  out.dist = Math.sqrt(best)
  out.s = TRACK_LINE[bi].s
  out.index = bi
  return out
}

const TURF = new THREE.Color('#7f8f55')
const TURF2 = new THREE.Color('#6a7a46')
const DUNE = new THREE.Color('#cdbf9c')

export const circuit: Field = {
  height(x, z) {
    const near = nearestOnTrack(x, z)
    // Graded flat across the track and its verges; rolling beyond.
    const roll = fbm(x * 0.006, z * 0.006, 3) * 2.4 + fbm(x * 0.03, z * 0.03, 2) * 0.25
    // Dunes rising behind the far side of the circuit.
    const dunes = 16 * ramp(near.dist, 150, 520)
    return (roll + dunes) * ramp(near.dist, TRACK.halfWidth + 2, 40)
  },
  colour(x, z) {
    const near = nearestOnTrack(x, z)
    const c = TURF.clone().lerp(TURF2, (fbm(x * 0.04, z * 0.04, 2) + 1) / 2)
    return c.lerp(DUNE, ramp(near.dist, 120, 420))
  },
  drag: (x, z) => (nearestOnTrack(x, z).dist <= TRACK.halfWidth + TRACK.kerb ? 0.012 : 0.14),
  sky: '#c5d3e2',
  haze: '#dbe2e8',
  fog: [350, 2200],
}

const ASPHALT = new THREE.Color('#48484c')
const KERB_RED = new THREE.Color('#b5362b')
const KERB_WHITE = new THREE.Color('#e9e7df')
const LINE = new THREE.Color('#f2f1ea')

/**
 * The tarmac and its kerbs as one ribbon laid just above the ground, so the
 * track edge is crisp regardless of how coarse the terrain grid is.
 */
export function circuitGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const n = TRACK_LINE.length

  const lift = (x: number, z: number) => circuit.height(x, z) + 0.03
  const quad = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    d: [number, number],
    colour: THREE.Color,
  ) => {
    const tri = (p: [number, number], q: [number, number], r: [number, number]) => {
      for (const [x, z] of [p, q, r]) {
        pos.push(x, lift(x, z), z)
        col.push(colour.r, colour.g, colour.b)
      }
    }
    tri(a, b, c)
    tri(a, c, d)
  }

  const edge = (p: TrackPoint, off: number): [number, number] => [
    p.x + p.tz * off,
    p.z - p.tx * off,
  ]

  const hw = TRACK.halfWidth
  const kw = hw + TRACK.kerb
  for (let i = 0; i < n; i++) {
    const p = TRACK_LINE[i]
    const q = TRACK_LINE[(i + 1) % n]
    const start = Math.abs(i - START_INDEX) <= 1
    const road = start ? LINE : ASPHALT
    quad(edge(p, -hw), edge(q, -hw), edge(q, hw), edge(p, hw), road)
    const kerb = Math.floor(i / 5) % 2 === 0 ? KERB_RED : KERB_WHITE
    quad(edge(p, hw), edge(q, hw), edge(q, kw), edge(p, kw), kerb)
    quad(edge(p, -kw), edge(q, -kw), edge(q, -hw), edge(p, -hw), kerb)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * Build the visible ground from a field. One big displaced grid: cheap, and
 * it means the mesh cannot disagree with the physics.
 */
export function terrainGeometry(field: Field, size: number, segments: number) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const colours = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = field.height(x, z)
    pos.setY(i, h)
    const c = field.colour(x, z, h)
    colours[i * 3] = c.r
    colours[i * 3 + 1] = c.g
    colours[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geo.computeVertexNormals()
  return geo
}

/** Surface normal by finite difference — used to sit vehicles on the ground. */
export function slopeAt(field: Field, x: number, z: number, out: THREE.Vector3) {
  const d = 1.5
  const hx = field.height(x + d, z) - field.height(x - d, z)
  const hz = field.height(x, z + d) - field.height(x, z - d)
  return out.set(-hx, 2 * d, -hz).normalize()
}
