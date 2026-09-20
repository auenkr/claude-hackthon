import * as THREE from 'three'

/**
 * Paint, in the absence of a paint shop.
 *
 * Nothing in this museum is textured: every exhibit is geometry generated
 * from cited dimensions, and an image map would be an undocumented assertion
 * about what a surface looked like. So the finish is baked into the vertices
 * instead, from rules that can be stated in a sentence each.
 *
 * A T-34-85 that left Nizhny Tagil wore 4BO protective green, brushed on
 * thinly enough that the plate showed through at every edge the crew touched.
 * A vehicle at the front in winter had whitewash slapped over that — lime and
 * water, which stuck to the upward faces, missed the undercuts and wore off
 * anything a boot or a mitten reached. And mud climbs the running gear from
 * below and never quite comes off. Those three rules are all this does.
 */

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Deterministic hash on a 3-D lattice, so the weathering never changes. */
function hash3(ix: number, iy: number, iz: number) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + 19.31) * 43758.5453
  return n - Math.floor(n)
}

function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const fz = smooth(z - iz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const c00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx)
  const c10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx)
  const c01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx)
  const c11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx)
  return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz)
}

/** Summed octaves, 0–1. */
function fbm3(x: number, y: number, z: number, octaves = 3) {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * f, y * f, z * f) * amp
    norm += amp
    amp *= 0.5
    f *= 2.13
  }
  return sum / norm
}

export interface Finish {
  /** Factory colour before anything happened to it. */
  base: THREE.ColorRepresentation
  /** How thoroughly the crew limewashed it, 0–1. */
  whitewash?: number
  /** How much of that has come back off, 0–1. */
  wear?: number
  /** Mud reaches this high in model metres; 0 for none. */
  mud?: number
  /** Exhaust staining and engine-deck oil, 0–1. */
  grime?: number
  /** Bare metal showing at rubbed edges, 0–1. */
  scuff?: number
  /** Feature size of the weathering, in metres. */
  scale?: number
}

const PALE = new THREE.Color('#9aa08c')
const LIME = new THREE.Color('#d9d7cd')
const MUD = new THREE.Color('#6c5b43')
const SOOT = new THREE.Color('#2d2a26')
const BARE = new THREE.Color('#8d8b86')

const c = new THREE.Color()

/**
 * Write a vertex-colour attribute onto a geometry. Returns the same
 * geometry so builders can paint inline. Needs positions and normals; the
 * kit's `loft` and `merge` both leave normals behind them.
 */
export function paint(geo: THREE.BufferGeometry, finish: Finish) {
  const {
    base,
    whitewash = 0,
    wear = 0.45,
    mud = 0,
    grime = 0,
    scuff = 0.5,
    scale = 0.42,
  } = finish

  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  const pos = geo.getAttribute('position')
  const nrm = geo.getAttribute('normal')
  const out = new Float32Array(pos.count * 3)
  const k = 1 / scale

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ny = nrm.getY(i)

    c.set(base)

    // Sun, dust and four years of rain take the edge off the green.
    const fade = fbm3(x * k * 0.6, y * k * 0.6, z * k * 0.6, 2)
    c.lerp(PALE, 0.05 + 0.13 * fade)
    // Plate-to-plate variation: the hull was painted a panel at a time.
    c.multiplyScalar(0.9 + 0.2 * noise3(x * 0.9, y * 0.9, z * 0.9))

    if (whitewash > 0) {
      // Lime runs off a vertical face and sits on a horizontal one.
      const caught = clamp01(0.4 + 0.6 * ny)
      const brush = fbm3(x * k * 1.7 + 11, y * k * 1.7, z * k * 1.7, 3)
      const left = clamp01((brush - wear) / Math.max(0.05, 1 - wear))
      c.lerp(LIME, clamp01(whitewash * caught * left) * 0.92)
    }

    if (mud > 0) {
      const climb = clamp01((mud - y) / mud) ** 1.5
      const splash = 0.5 + 0.5 * fbm3(x * k * 2.4, y * k * 2.4 + 5, z * k * 2.4, 2)
      c.lerp(MUD, clamp01(climb * splash) * 0.92)
    }

    if (grime > 0) {
      const dirt = clamp01(0.25 + 0.75 * fbm3(x * k + 31, y * k, z * k + 7, 2))
      c.lerp(SOOT, grime * dirt * 0.8)
    }

    // Anything the crew climbed over rubs back to metal. Sharp noise on the
    // faces that stand proud, so it collects along edges rather than in the
    // middle of a plate.
    if (scuff > 0) {
      const rub = clamp01((fbm3(x * k * 3.4 + 3, y * k * 3.4, z * k * 3.4, 2) - 0.66) * 5)
      c.lerp(BARE, rub * scuff * (0.35 + 0.65 * Math.abs(ny)))
    }

    out[i * 3] = c.r
    out[i * 3 + 1] = c.g
    out[i * 3 + 2] = c.b
  }

  geo.setAttribute('color', new THREE.BufferAttribute(out, 3))
  return geo
}

/**
 * Paint a set of pieces individually, then weld them into one draw call.
 *
 * The kit's `merge` keeps positions alone, which is all a single-colour part
 * needs. A tool box bolted to a mudguard is a different colour from the
 * mudguard, so the finish has to be baked before the pieces are joined —
 * and the normals carried across, or a lofted casting would come out of the
 * weld faceted.
 */
export function weld(pieces: { geo: THREE.BufferGeometry; finish: Finish }[]) {
  let total = 0
  for (const p of pieces) {
    paint(p.geo, p.finish)
    total += p.geo.getAttribute('position').count
  }
  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const colour = new Float32Array(total * 3)
  let at = 0
  for (const p of pieces) {
    const g = p.geo
    position.set(g.getAttribute('position').array as ArrayLike<number>, at)
    normal.set(g.getAttribute('normal').array as ArrayLike<number>, at)
    colour.set(g.getAttribute('color').array as ArrayLike<number>, at)
    at += g.getAttribute('position').count * 3
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  out.setAttribute('color', new THREE.BufferAttribute(colour, 3))
  return out
}

/** The factory's own colours, so every builder reaches for the same tin. */
export const PAINT = {
  /** 4BO protective green. */
  green: '#4c5540',
  /** Cast steel, unpainted inside the mantlet collar and on worn castings. */
  cast: '#59604c',
  /** Track, sprocket teeth, tools — polished by use. */
  steel: '#54565a',
  /** Rubber tyres and vision-block glass. */
  rubber: '#1e1e21',
  /** Engine block and transmission, under the deck. */
  iron: '#3d4248',
} as const
