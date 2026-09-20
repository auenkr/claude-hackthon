import * as THREE from 'three'
import { fbm, ramp, type Field } from '../terrain'

/**
 * A road circuit in the dunes.
 *
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
