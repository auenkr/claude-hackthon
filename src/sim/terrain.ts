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

// --- A Paris boulevard ------------------------------------------------------
/**
 * The Champs-Élysées, running +Z from the Étoile down toward the Rond-Point.
 * The avenue falls roughly twenty-five metres over its length, which is what
 * makes a machine with no freewheel and a spoon brake interesting.
 */
export const AVENUE = { halfWidth: 9, length: 1200, drop: 25 }
/** The fall is front-loaded: steep away from the Étoile, then easing. */
const STEEP = { length: 350, drop: 14 }

const PAVE = new THREE.Color('#5e5b57')
const PAVE2 = new THREE.Color('#6d6964')
const KERB = new THREE.Color('#9a958c')
const GRAVEL = new THREE.Color('#a89c86')
const LAWN = new THREE.Color('#7d8a5a')

function onAvenue(x: number, z: number) {
  return ramp(AVENUE.halfWidth + 2 - Math.abs(x), 0, 2.5) * ramp(z + 60, 0, 30)
}

export const boulevard: Field = {
  height(x, z) {
    const upper = THREE.MathUtils.clamp(z, 0, STEEP.length)
    const lower = THREE.MathUtils.clamp(z - STEEP.length, 0, AVENUE.length - STEEP.length)
    const grade =
      (-STEEP.drop / STEEP.length) * upper -
      ((AVENUE.drop - STEEP.drop) / (AVENUE.length - STEEP.length)) * lower
    // Setts laid in fans: a fine ripple the wheels feel but the eye barely sees.
    const cobbles = fbm(x * 1.7, z * 1.7, 2) * 0.014
    // The pavements sit a kerb's height above the carriageway.
    const kerb = 0.12 * (1 - onAvenue(x, z))
    const rolling = fbm(x * 0.01, z * 0.01, 2) * 0.6 * (1 - onAvenue(x, z))
    return grade + cobbles + kerb + rolling
  },
  colour(x, z) {
    const road = onAvenue(x, z)
    const edge = Math.abs(Math.abs(x) - AVENUE.halfWidth - 1)
    const c = GRAVEL.clone().lerp(LAWN, ramp(Math.abs(x), 30, 60))
    if (edge < 1.2) c.lerp(KERB, 0.8)
    return c.lerp(PAVE.clone().lerp(PAVE2, noise(x * 0.9, z * 0.9)), road)
  },
  drag: (x, z) => 0.02 + 0.05 * (1 - onAvenue(x, z)),
  sky: '#c7ccd2',
  haze: '#d8dbdd',
  fog: [160, 1400],
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
