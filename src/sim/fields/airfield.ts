import * as THREE from 'three'
import { clamp01, fbm, noise, ramp, type Field } from '../terrain'

/**
 * A wartime fighter station: one paved strip, a perimeter track, dispersal
 * loops off it, and a technical site in the north-west corner.
 *
 * The paving is defined here and nowhere else. The terrain mesh, the rolling
 * resistance under the wheels and the scene's own markings all read the same
 * functions, so the aeroplane cannot be rolling on concrete the visitor
 * cannot see, or bogged in grass that looks like a runway.
 *
 * Runway centred on the origin, laid along Z.
 */

export const RUNWAY = { halfWidth: 22, length: 1500, y: 0 }

/** The perimeter track, parallel to the strip on the eastern side. */
export const TAXIWAY = { x: 128, halfWidth: 7.5, from: -720, to: 720 }

/** Where the taxiway joins the runway, at each end. */
export const LINKS = [-690, 690]

/** Dispersal loops: where the aircraft are parked, well spread out. */
export const DISPERSALS = [
  { x: 176, z: -520, r: 17 },
  { x: 176, z: -368, r: 17 },
  { x: 176, z: 200, r: 17 },
  { x: 176, z: 352, r: 17 },
  { x: -104, z: -300, r: 16 },
  { x: -104, z: -150, r: 16 },
]

/** The technical site: tower, hangars, huts, all on one slab. */
export const APRON = { x: 205, z: -170, hx: 78, hz: 130 }

/** A farm road crossing the north of the field — the convoy uses it. */
export const ROAD = { z: 1080, halfWidth: 4.5, from: -900, to: 900 }

const GRASS = new THREE.Color('#8f9a63')
const GRASS2 = new THREE.Color('#79864f')
const TARMAC = new THREE.Color('#57575a')
const CONCRETE = new THREE.Color('#6d6d69')
const DIRT = new THREE.Color('#8a7a5c')

/** Smooth rectangle, 1 inside and feathering to 0 over `f` metres. */
function slabAt(
  x: number,
  z: number,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  f: number,
) {
  return ramp(hx + f - Math.abs(x - cx), 0, f) * ramp(hz + f - Math.abs(z - cz), 0, f)
}

function disc(x: number, z: number, cx: number, cz: number, r: number, f: number) {
  return ramp(r + f - Math.hypot(x - cx, z - cz), 0, f)
}

/** How much of this point is paved, 0–1. */
export function paving(x: number, z: number) {
  let p = slabAt(x, z, 0, 0, RUNWAY.halfWidth, RUNWAY.length / 2, 6)
  p = Math.max(p, slabAt(x, z, TAXIWAY.x, (TAXIWAY.from + TAXIWAY.to) / 2, TAXIWAY.halfWidth, (TAXIWAY.to - TAXIWAY.from) / 2, 5))
  for (const z0 of LINKS) {
    p = Math.max(p, slabAt(x, z, TAXIWAY.x / 2, z0, TAXIWAY.x / 2, TAXIWAY.halfWidth, 5))
  }
  for (const d of DISPERSALS) p = Math.max(p, disc(x, z, d.x, d.z, d.r, 5))
  // The western dispersals hang off a short spur of their own.
  p = Math.max(p, slabAt(x, z, -104, -225, 5, 90, 4))
  p = Math.max(p, slabAt(x, z, -63, -300, 42, 5, 4))
  p = Math.max(p, slabAt(x, z, APRON.x, APRON.z, APRON.hx, APRON.hz, 8))
  return p
}

/** Unpaved but driven on: the farm road the convoy comes down. */
function road(x: number, z: number) {
  return (
    ramp(ROAD.halfWidth + 3 - Math.abs(z - ROAD.z), 0, 3) *
    ramp(ROAD.to + 40 - Math.abs(x), 0, 40)
  )
}

/**
 * The aerodrome itself is a graded plateau — you do not lay a mile and a half
 * of concrete across a hillside — so the rolling ground is flattened out over
 * the whole station and killed entirely under the paving.
 */
function graded(x: number, z: number) {
  return slabAt(x, z, 60, 0, 300, 900, 520)
}

export function onRunway(x: number, z: number) {
  return (
    ramp(RUNWAY.halfWidth + 5 - Math.abs(x), 0, 6) *
    ramp(RUNWAY.length / 2 + 5 - Math.abs(z), 0, 8)
  )
}

export const airfield: Field = {
  height(x, z) {
    const rolling = fbm(x * 0.004, z * 0.004, 3) * 4.5 + fbm(x * 0.02, z * 0.02, 2) * 0.5
    return rolling * (1 - 0.93 * graded(x, z)) * (1 - paving(x, z))
  },
  colour(x, z) {
    const paved = paving(x, z)
    const c = GRASS.clone().lerp(GRASS2, noise(x * 0.05, z * 0.05))
    // Mown stripes across the field, the way an airfield is actually cut.
    c.multiplyScalar(0.95 + 0.08 * (Math.floor(z / 60) % 2))
    c.lerp(DIRT, road(x, z) * 0.85)
    // The strip is worn darker than the perimeter track that feeds it.
    const stone = CONCRETE.clone().lerp(TARMAC, clamp01(onRunway(x, z) + 0.15 * noise(x * 0.3, z * 0.3)))
    return c.lerp(stone, paved)
  },
  drag: (x, z) => 0.018 + 0.055 * (1 - paving(x, z)) * (1 - 0.4 * road(x, z)),
  sky: '#b9cadd',
  haze: '#d6dee6',
  fog: [400, 2600],
}
