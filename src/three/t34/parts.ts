import * as THREE from 'three'
import { loft, roundedRing, sampleBelt, type BeltPoint, type Circle } from '../geometry'
import { weld, PAINT, type Finish } from './paint'
import {
  ARM,
  BARREL,
  CUPOLA,
  DECK,
  FLOOR,
  GLACIS,
  HW_DECK,
  HW_LOWER,
  IDLER,
  LOADER,
  NOSE,
  NOSE_Y,
  RING_R,
  SIDE_BREAK,
  SPROCKET,
  STERN,
  TRACK_PITCH,
  TRACK_W,
  TRUNNION,
  TURRET_H,
  WHEEL_R,
  WHEEL_Z,
} from './dims'

/**
 * The metal.
 *
 * Every assembly here is built from the figures in `dims.ts` and welded into
 * one buffer per catalogued part, so the exhibit can explode fourteen pieces
 * and the simulation can still draw the whole tank in about twenty calls.
 */

// --- Primitives -------------------------------------------------------------

const box = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d).toNonIndexed()

const cyl = (rTop: number, rBot: number, h: number, seg = 12) =>
  new THREE.CylinderGeometry(rTop, rBot, h, seg).toNonIndexed()

/** A cylinder lying along Z, which is how most of a tank's hardware sits. */
const tube = (r: number, len: number, seg = 12) => {
  const g = cyl(r, r, len, seg)
  g.rotateX(Math.PI / 2)
  return g
}

const sph = (r: number, seg = 12) =>
  new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)).toNonIndexed()

const ring = (r: number, thick: number, arc = Math.PI * 2, seg = 16) =>
  new THREE.TorusGeometry(r, thick, 6, seg, arc).toNonIndexed()

interface Place {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
}

function put(g: THREE.BufferGeometry, p: Place) {
  if (p.rx) g.rotateX(p.rx)
  if (p.ry) g.rotateY(p.ry)
  if (p.rz) g.rotateZ(p.rz)
  g.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  return g
}

/** A swept tube through a list of points — cables, springs, handrails. */
function rope(points: [number, number, number][], radius: number, radial = 5, density = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  return new THREE.TubeGeometry(
    curve,
    Math.round(points.length * density),
    radius,
    radial,
    false,
  ).toNonIndexed()
}

/** A U-shaped grab handle standing off a face. */
function handle(len: number, stand: number, r = 0.016) {
  return weldless([
    put(cyl(r, r, stand, 6), { x: -len / 2, y: stand / 2 }),
    put(cyl(r, r, stand, 6), { x: len / 2, y: stand / 2 }),
    put(cyl(r, r, len, 6), { rz: Math.PI / 2, y: stand }),
  ])
}

/** Concatenate positions and normals without painting: for sub-assemblies. */
function weldless(geos: THREE.BufferGeometry[]) {
  let total = 0
  for (const g of geos) total += g.getAttribute('position').count
  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  let at = 0
  for (const g of geos) {
    position.set(g.getAttribute('position').array as ArrayLike<number>, at)
    normal.set(g.getAttribute('normal').array as ArrayLike<number>, at)
    at += g.getAttribute('position').count * 3
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  return out
}

// --- Finishes ---------------------------------------------------------------

const GREEN: Finish = { base: PAINT.green, whitewash: 0.58, wear: 0.4, scuff: 0.45 }
/** Anything low enough for the tracks to throw mud at. */
const GREEN_LOW: Finish = { ...GREEN, mud: 1.15 }
/** The mudguards, which catch all of it. */
const GREEN_MUD: Finish = { ...GREEN, mud: 1.4, whitewash: 0.4, wear: 0.55 }
const CASTING: Finish = {
  base: PAINT.cast,
  whitewash: 0.5,
  wear: 0.5,
  scuff: 0.6,
  scale: 0.6,
}
const TOOLS: Finish = { base: PAINT.steel, scuff: 0.8, scale: 0.18 }
const RUNNING: Finish = { base: '#4a4740', grime: 0.45, scuff: 0.7, scale: 0.16 }
const TYRE: Finish = { base: PAINT.rubber, grime: 0.35, scuff: 0.1, scale: 0.12 }
const MACHINERY: Finish = { base: PAINT.iron, grime: 0.5, scuff: 0.35, scale: 0.25 }
const EXHAUST: Finish = { base: '#4a4038', grime: 0.75, scuff: 0.5, scale: 0.2 }

// --- Glacis helper ----------------------------------------------------------

const GS = Math.sin(GLACIS)
const GC = Math.cos(GLACIS)

/**
 * Place something on the glacis. `u` is across the plate (+ to port), `v` is
 * up the slope from the nose edge, `lift` stands it off along the normal.
 * Geometry arrives flat in XZ and leaves lying on the 60° plate.
 */
function onGlacis(g: THREE.BufferGeometry, u: number, v: number, lift = 0) {
  return put(g, {
    rx: GLACIS,
    x: u,
    y: NOSE_Y + v * GS + lift * GC,
    z: NOSE - v * GC + lift * GS,
  })
}

// --- Hull -------------------------------------------------------------------

interface Station {
  z: number
  floor: number
  deck: number
  /** Narrows the section as it runs out at the nose and tail. */
  pinch?: number
}

/**
 * Hull stations. The glacis climbs at exactly 30° above the horizontal from
 * the knife edge at the nose to the deck line, which is the 60°-from-vertical
 * the armour schedule specifies; the lower front plate falls away behind it.
 */
const HULL: Station[] = [
  { z: NOSE, floor: NOSE_Y - 0.02, deck: NOSE_Y, pinch: 0.78 },
  { z: 2.8, floor: 0.62, deck: 0.99, pinch: 0.9 },
  { z: 2.55, floor: FLOOR, deck: 1.14, pinch: 0.96 },
  { z: 2.2, floor: FLOOR, deck: 1.34, pinch: 1 },
  { z: 1.92, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: 0.6, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: -0.6, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: -1.7, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: -2.35, floor: FLOOR, deck: 1.42, pinch: 1 },
  { z: -2.8, floor: 0.44, deck: 1.2, pinch: 0.99 },
  { z: STERN, floor: 0.62, deck: 1.0, pinch: 0.93 },
]

/** Vertical lower side, sponson sloped out at 40° from vertical, flat roof. */
function hullRing(st: Station) {
  const k = st.pinch ?? 1
  const brk = Math.min(SIDE_BREAK, Math.max(st.floor + 0.01, st.deck - 0.62))
  const pts: [number, number][] = [
    [HW_LOWER * k, st.floor],
    [HW_LOWER * k, brk],
    [HW_DECK * k, st.deck],
    [-HW_DECK * k, st.deck],
    [-HW_LOWER * k, brk],
    [-HW_LOWER * k, st.floor],
  ]
  return pts.map(([x, y]) => new THREE.Vector3(x, y, st.z))
}

function hullGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = [
    { geo: loft(HULL.map(hullRing)), finish: GREEN_LOW },
  ]
  const add = (geo: THREE.BufferGeometry, finish: Finish = GREEN) => pieces.push({ geo, finish })

  // Weld beads down the glacis joins. A T-34 was welded by hand, often badly,
  // and the proud bead is the most recognisable thing about the plate work.
  for (const s of [1, -1]) {
    add(onGlacis(box(0.05, 0.035, 1.3), s * 1.3, 0.65, 0.01), CASTING)
  }
  add(put(box(2.5, 0.05, 0.05), { y: DECK + 0.005, z: 1.9 }), CASTING)

  // Driver's hatch frame, port side of the glacis.
  add(onGlacis(box(0.62, 0.05, 0.72), 0.44, 0.68, 0.015))

  // Spare track links bolted across the glacis, which is where a crew put
  // them: free armour over the thinnest part of the plate.
  for (let i = 0; i < 4; i++) {
    add(onGlacis(box(0.17, 0.05, TRACK_PITCH * 0.9), -0.12 + i * 0.185, 0.3, 0.035), TOOLS)
  }

  // Towing eyes: two at the nose, two on the rear plate.
  for (const s of [1, -1]) {
    add(put(box(0.1, 0.24, 0.18), { x: s * 0.55, y: 0.62, z: 2.78 }), CASTING)
    add(put(box(0.1, 0.22, 0.16), { x: s * 0.62, y: 0.78, z: -2.96 }), CASTING)
  }

  // Headlight and horn, centre-left of the glacis on a short bracket.
  add(onGlacis(cyl(0.11, 0.11, 0.12, 14), 0.2, 1.0, 0.11), TOOLS)
  add(onGlacis(ring(0.11, 0.015), 0.2, 1.0, 0.17), TOOLS)
  add(onGlacis(cyl(0.02, 0.02, 0.12, 6), 0.2, 1.0, 0.05), TOOLS)
  add(onGlacis(cyl(0.06, 0.08, 0.1, 10), -0.04, 0.95, 0.09), TOOLS)

  // Grab handles for the tank riders, who travelled on the engine deck.
  for (const s of [1, -1]) {
    add(onGlacis(handle(0.3, 0.07), s * 0.95, 1.05, 0), TOOLS)
    add(put(handle(0.3, 0.07), { x: s * 1.12, y: DECK, z: -0.9 }), TOOLS)
    add(put(handle(0.3, 0.07), { x: s * 1.12, y: DECK, z: -2.1 }), TOOLS)
  }

  // Turret ring collar and its splash guard.
  add(put(cyl(RING_R + 0.05, RING_R + 0.05, 0.06, 40), { y: DECK + 0.02, z: 0.15 }), CASTING)

  // Rear plate: transmission access door and its hinges.
  add(put(box(1.15, 0.5, 0.06), { rx: -0.35, y: 0.86, z: -3.02 }))
  for (const s of [1, -1]) add(put(box(0.1, 0.1, 0.1), { x: s * 0.5, y: 1.08, z: -2.96 }), CASTING)

  return weld(pieces)
}

/**
 * The driver's hatch, built about the hinge along its upper edge so it can
 * swing up and forward the way the real one does — taking the driver's two
 * periscopes with it, which is why he could not open it under fire.
 */
function driverHatchGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  pieces.push({ geo: put(box(0.56, 0.06, 0.66), { z: 0.33 }), finish: GREEN })
  for (const s of [1, -1]) {
    pieces.push({
      geo: put(box(0.14, 0.09, 0.08), { x: s * 0.16, y: 0.06, z: 0.14 }),
      finish: TOOLS,
    })
  }
  return weld(pieces)
}

// --- Engine deck ------------------------------------------------------------

function deckGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const add = (geo: THREE.BufferGeometry, finish: Finish = GREEN) => pieces.push({ geo, finish })

  // Engine access hatch, dead centre over the V-12.
  add(put(box(0.96, 0.05, 1.0), { y: DECK + 0.03, z: -1.5 }))
  for (const s of [1, -1]) add(put(box(0.12, 0.07, 0.09), { x: s * 0.3, y: DECK + 0.05, z: -1.0 }), TOOLS)
  add(put(handle(0.24, 0.05), { y: DECK + 0.05, z: -1.95 }), TOOLS)

  // Air intakes either side of it, under louvred covers.
  for (const s of [1, -1]) {
    add(put(box(0.6, 0.05, 0.9), { x: s * 0.94, y: DECK + 0.02, z: -1.5 }))
    for (let i = 0; i < 7; i++) {
      add(
        put(box(0.54, 0.045, 0.055), {
          rx: 0.5,
          x: s * 0.94,
          y: DECK + 0.07,
          z: -1.88 + i * 0.125,
        }),
        MACHINERY,
      )
    }
  }

  // Radiator louvres across the sloping rear deck. These are the grilles that
  // make the back of a T-34 unmistakable from the air.
  for (let i = 0; i < 9; i++) {
    add(
      put(box(1.9, 0.05, 0.07), {
        rx: 0.62,
        y: 1.44 - i * 0.026,
        z: -2.33 - i * 0.056,
      }),
      MACHINERY,
    )
  }
  // The mesh over them, so nothing drops into the fan.
  for (let i = 0; i < 11; i++) {
    add(
      put(box(0.02, 0.02, 0.62), { rx: 0.62, x: -0.95 + i * 0.19, y: 1.36, z: -2.57 }),
      MACHINERY,
    )
  }

  // Fuel filler caps, and the two exhausts out of the rear plate.
  for (const s of [1, -1]) {
    add(put(cyl(0.09, 0.09, 0.05, 12), { x: s * 1.18, y: DECK + 0.02, z: -0.7 }), TOOLS)
    add(put(tube(0.1, 0.34, 12), { x: s * 0.56, y: 1.02, z: -3.14 }), EXHAUST)
    add(put(tube(0.16, 0.18, 12), { x: s * 0.56, y: 1.02, z: -3.0 }), EXHAUST)
  }

  return weld(pieces)
}

// --- Turret -----------------------------------------------------------------

/**
 * The plan of the casting: wide and rounded, with the bustle carrying the
 * radio and the weight of the breech overhanging the rear of the ring.
 */
const TURRET_PLAN = [
  { angle: Math.PI / 2, radius: 1.0 },
  { angle: Math.PI / 4, radius: 1.02 },
  { angle: 0, radius: 0.96 },
  { angle: -Math.PI / 4, radius: 1.14 },
  { angle: -Math.PI / 2, radius: 1.3 },
  { angle: (-3 * Math.PI) / 4, radius: 1.14 },
  { angle: Math.PI, radius: 0.96 },
  { angle: (3 * Math.PI) / 4, radius: 1.02 },
]

/** Sides draw in 23° from vertical as the casting rises: 75 mm at 20°. */
const TURRET_LOFT: [number, number][] = [
  [-0.06, 0.07],
  [0.03, 0.0],
  [0.4, 0.14],
  [0.72, 0.27],
  [0.84, 0.34],
  [TURRET_H, 0.42],
]

function turretRing(y: number, shrink: number) {
  return roundedRing(
    TURRET_PLAN.map((c) => ({ angle: c.angle, radius: c.radius - shrink })),
    44,
    y,
  )
}

/** Radius of the casting at a given height and bearing, for placing fittings. */
function turretRadius(y: number, angle: number) {
  let shrink = TURRET_LOFT[0][1]
  for (let i = 1; i < TURRET_LOFT.length; i++) {
    const [y0, s0] = TURRET_LOFT[i - 1]
    const [y1, s1] = TURRET_LOFT[i]
    if (y <= y1) {
      shrink = s0 + ((s1 - s0) * (y - y0)) / (y1 - y0)
      break
    }
    shrink = s1
  }
  let num = 0
  let den = 0
  for (const c of TURRET_PLAN) {
    let d = Math.abs(((angle - c.angle + Math.PI) % (Math.PI * 2)) - Math.PI)
    d = Math.max(d, 1e-4)
    const w = 1 / d ** 3
    num += c.radius * w
    den += w
  }
  return num / den - shrink
}

function turretGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = [
    { geo: loft(TURRET_LOFT.map(([y, s]) => turretRing(y, s))), finish: CASTING },
  ]
  const add = (geo: THREE.BufferGeometry, finish: Finish = CASTING) => pieces.push({ geo, finish })

  // The mantlet aperture: a cast collar standing proud of the front.
  const front = turretRadius(TRUNNION.y, Math.PI / 2)
  add(put(tube(0.5, 0.12, 24), { y: TRUNNION.y, z: front - 0.02 }))
  add(put(tube(0.37, 0.2, 24), { y: TRUNNION.y, z: front + 0.02 }))

  // The seam where the two halves of the mould met, ground back but visible.
  add(put(ring(0.98, 0.012, Math.PI * 2, 40), { rx: Math.PI / 2, y: 0.46, z: -0.12 }))

  // Roof: gunner's periscope hood and the two extractor domes at the back.
  add(put(box(0.2, 0.1, 0.24), { x: 0.3, y: TURRET_H + 0.05, z: 0.34 }), TOOLS)
  for (const s of [1, -1]) {
    add(put(sph(0.11, 12), { x: s * 0.24, y: TURRET_H, z: -0.86 }))
    add(put(cyl(0.12, 0.13, 0.05, 14), { x: s * 0.24, y: TURRET_H + 0.02, z: -0.86 }))
  }

  // Lifting eyes: two forward on the cheeks, one on the bustle.
  for (const s of [1, -1]) {
    add(put(ring(0.08, 0.022, Math.PI, 10), { rz: Math.PI / 2, x: s * 0.62, y: TURRET_H - 0.05, z: 0.4 }))
  }
  add(put(ring(0.08, 0.022, Math.PI, 10), { rz: Math.PI / 2, y: TURRET_H - 0.06, z: -1.0 }))

  // Handrails down the turret sides: the tank-rider's only handhold.
  for (const s of [1, -1]) {
    const r = turretRadius(0.5, s > 0 ? 0 : Math.PI)
    add(
      put(rope(
        [
          [0, 0, 0.5],
          [-0.1, 0, 0.16],
          [-0.1, 0, -0.3],
          [0, 0, -0.66],
        ],
        0.018,
      ), { x: s * r, y: 0.5, ry: s > 0 ? 0 : Math.PI }),
      TOOLS,
    )
  }

  // Pistol ports in the bustle sides, plugged.
  for (const s of [1, -1]) {
    const r = turretRadius(0.42, s > 0 ? -Math.PI / 3 : Math.PI + Math.PI / 3)
    const a = s > 0 ? -Math.PI / 3 : Math.PI + Math.PI / 3
    add(put(cyl(0.07, 0.07, 0.06, 10), {
      rz: Math.PI / 2,
      ry: -a,
      x: Math.cos(a) * r,
      y: 0.42,
      z: Math.sin(a) * r,
    }))
  }

  return weld(pieces)
}

/** Commander's cupola: five vision slits and a two-piece hatch on top. */
function cupolaGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  pieces.push({ geo: put(cyl(CUPOLA.r, CUPOLA.r + 0.03, 0.2, 26), { y: 0.1 }), finish: CASTING })
  pieces.push({ geo: put(cyl(CUPOLA.r + 0.015, CUPOLA.r + 0.015, 0.04, 26), { y: 0.2 }), finish: CASTING })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    pieces.push({
      geo: put(box(0.11, 0.06, 0.03), {
        ry: -a,
        x: Math.cos(a) * (CUPOLA.r + 0.01),
        y: 0.09,
        z: Math.sin(a) * (CUPOLA.r + 0.01),
      }),
      finish: { base: '#15161a', scuff: 0.05, scale: 0.1 },
    })
  }
  return weld(pieces)
}

/**
 * One leaf of the cupola's split hatch, built about the diameter it hinges
 * on so the group need only rotate about Z to throw it open.
 */
function cupolaLeafGeometry(sign: number) {
  const r = CUPOLA.r - 0.01
  const leaf = new THREE.CylinderGeometry(
    r,
    r,
    0.05,
    20,
    1,
    false,
    sign > 0 ? 0 : Math.PI,
    Math.PI,
  ).toNonIndexed()
  return weld([
    { geo: leaf, finish: GREEN },
    { geo: put(handle(0.14, 0.045), { x: sign * 0.16, y: 0.025 }), finish: TOOLS },
  ])
}

/** Loader's hatch, round, hinged at its rear edge. */
function loaderHatchGeometry() {
  return weld([
    { geo: put(cyl(LOADER.r, LOADER.r, 0.05, 22), { z: LOADER.r }), finish: GREEN },
    { geo: put(handle(0.16, 0.05), { y: 0.03, z: LOADER.r }), finish: TOOLS },
  ])
}

// --- Gun --------------------------------------------------------------------

/** The cast mantlet, built about the trunnion. */
function mantletGeometry() {
  const profile = (z: number, k: number) =>
    roundedRing(
      [
        { angle: 0, radius: 0.44 * k },
        { angle: Math.PI / 2, radius: 0.33 * k },
        { angle: Math.PI, radius: 0.44 * k },
        { angle: -Math.PI / 2, radius: 0.31 * k },
      ],
      26,
      z,
    ).map((p) => new THREE.Vector3(p.x, p.z, p.y))

  const body = loft([
    profile(0.2, 0.86),
    profile(0.32, 1.0),
    profile(0.62, 0.98),
    profile(0.78, 0.82),
    profile(0.84, 0.6),
  ])

  return weld([
    { geo: body, finish: CASTING },
    // Bearing collar the barrel runs through.
    { geo: put(tube(0.17, 0.3, 20), { z: 0.86 }), finish: CASTING },
    // Coaxial DT, starboard of the gun where the gunner can reach its magazine.
    { geo: put(tube(0.055, 0.22, 12), { x: -0.2, z: 0.72 }), finish: TOOLS },
    { geo: put(tube(0.028, 0.34, 10), { x: -0.2, y: -0.02, z: 0.95 }), finish: TOOLS },
  ])
}

/** ZiS-S-53: breech, cradle and 4.6 m of tube, built about the trunnion. */
function gunGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const add = (geo: THREE.BufferGeometry, finish: Finish = MACHINERY) => pieces.push({ geo, finish })

  // Breech ring and the semi-automatic vertical sliding block behind it.
  add(put(box(0.38, 0.42, 0.62), { z: -0.42 }))
  add(put(box(0.3, 0.46, 0.1), { z: -0.74 }), TOOLS)
  // Recoil guard, which is the thing that would kill the loader if it were not there.
  add(put(box(0.5, 0.04, 0.5), { y: -0.26, z: -0.55 }), TOOLS)
  for (const s of [1, -1]) add(put(box(0.04, 0.5, 0.04), { x: s * 0.24, y: -0.02, z: -0.8 }), TOOLS)

  // Cradle and the recuperator above the tube, which is what the housing on
  // top of the mantlet actually covers.
  add(put(tube(0.15, 0.62, 16), { z: 0.1 }))
  add(put(tube(0.075, 0.5, 12), { y: 0.17, z: 0.2 }))

  // Trunnion stubs.
  for (const s of [1, -1]) add(put(cyl(0.07, 0.07, 0.1, 10), { rz: Math.PI / 2, x: s * 0.3 }))

  // The tube: chamber end thick, tapering to the muzzle, with the slight
  // swell at the crown that a shrunk-on muzzle ring leaves.
  const taper = loft(
    [
      [0.62, 0.108],
      [1.1, 0.098],
      [2.4, 0.082],
      [3.8, 0.07],
      [BARREL - 0.24, 0.066],
      [BARREL - 0.18, 0.076],
      [BARREL - 0.02, 0.075],
      [BARREL, 0.068],
    ].map(([z, r]) => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < 18; i++) {
        const t = (i / 18) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, z))
      }
      return pts
    }),
  )
  add(taper, TOOLS)

  return weld(pieces)
}

// --- Running gear -----------------------------------------------------------

/** One road wheel: twin dished spiders, steel rims, solid rubber tyres. */
function roadWheelGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  pieces.push({ geo: put(cyl(0.11, 0.11, 0.3, 14), { rz: Math.PI / 2 }), finish: RUNNING })
  for (const s of [1, -1]) {
    const x = s * 0.12
    pieces.push({ geo: put(cyl(0.34, 0.34, 0.035, 22), { rz: Math.PI / 2, x }), finish: RUNNING })
    // Eight spokes, which is what stops the wheel being a solid disc.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      pieces.push({
        geo: put(box(0.055, 0.1, 0.26), { rx: a, x, z: 0.11 * Math.cos(a) }),
        finish: RUNNING,
      })
    }
    pieces.push({
      geo: put(cyl(WHEEL_R - 0.055, WHEEL_R - 0.055, 0.1, 24), { rz: Math.PI / 2, x }),
      finish: RUNNING,
    })
    pieces.push({
      geo: put(cyl(WHEEL_R, WHEEL_R, 0.115, 26), { rz: Math.PI / 2, x }),
      finish: TYRE,
    })
    // Hub cap and its studs.
    pieces.push({ geo: put(cyl(0.1, 0.1, 0.06, 12), { rz: Math.PI / 2, x: x + s * 0.16 }), finish: RUNNING })
  }
  return weld(pieces)
}

/** Rear drive sprocket: two discs carrying six roller teeth. */
function sprocketGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  pieces.push({ geo: put(cyl(0.14, 0.14, 0.34, 14), { rz: Math.PI / 2 }), finish: RUNNING })
  for (const s of [1, -1]) {
    pieces.push({
      geo: put(cyl(SPROCKET.r - 0.03, SPROCKET.r - 0.03, 0.04, 22), { rz: Math.PI / 2, x: s * 0.13 }),
      finish: RUNNING,
    })
  }
  for (let i = 0; i < SPROCKET.teeth; i++) {
    const a = (i / SPROCKET.teeth) * Math.PI * 2
    pieces.push({
      geo: put(cyl(0.05, 0.05, 0.24, 8), {
        rz: Math.PI / 2,
        y: Math.sin(a) * SPROCKET.r,
        z: Math.cos(a) * SPROCKET.r,
      }),
      finish: { base: '#6a6a66', grime: 0.2, scuff: 0.9, scale: 0.1 },
    })
  }
  return weld(pieces)
}

/** Front idler on its cranked axle — the crank is the track tensioner. */
function idlerGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  pieces.push({ geo: put(cyl(0.1, 0.1, 0.3, 12), { rz: Math.PI / 2 }), finish: RUNNING })
  for (const s of [1, -1]) {
    pieces.push({
      geo: put(cyl(IDLER.r, IDLER.r, 0.09, 20), { rz: Math.PI / 2, x: s * 0.11 }),
      finish: RUNNING,
    })
    pieces.push({
      geo: put(cyl(IDLER.r - 0.045, IDLER.r - 0.045, 0.13, 18), { rz: Math.PI / 2, x: s * 0.11 }),
      finish: TYRE,
    })
  }
  return weld(pieces)
}

/** The crank that carries the idler, drawn on the hull side. */
function idlerCrankGeometry() {
  return weld([
    { geo: put(box(0.12, 0.2, 0.44), { rx: 0.35, z: -0.16 }), finish: GREEN_LOW },
    { geo: put(cyl(0.09, 0.09, 0.14, 12), { rz: Math.PI / 2, z: -0.34 }), finish: RUNNING },
  ])
}

/**
 * The suspension: a swing arm per wheel and, inside the hull side, the long
 * vertical coil spring that is the whole Christie idea. The spring is only
 * visible in the x-ray, which is rather the point of having one.
 */
function armGeometry() {
  const L = Math.hypot(ARM.dz, ARM.dy)
  return weld([
    { geo: put(box(0.11, 0.15, L - 0.1), { z: -L / 2 }), finish: GREEN_LOW },
    { geo: put(cyl(0.09, 0.09, 0.16, 12), { rz: Math.PI / 2 }), finish: RUNNING },
    { geo: put(cyl(0.07, 0.07, 0.2, 10), { rz: Math.PI / 2, z: -L }), finish: RUNNING },
  ])
}

function springGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  for (const s of [1, -1]) {
    for (let i = 0; i < WHEEL_Z.length; i++) {
      const pts: [number, number, number][] = []
      const turns = 6
      const steps = turns * 5
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const a = t * turns * Math.PI * 2
        pts.push([
          s * (0.7 + Math.cos(a) * 0.09),
          0.5 + t * 0.85,
          WHEEL_Z[i] + 0.2 + Math.sin(a) * 0.09,
        ])
      }
      pieces.push({ geo: rope(pts, 0.018, 4, 2), finish: MACHINERY })
    }
  }
  return weld(pieces)
}

// --- Track ------------------------------------------------------------------

const TAU = Math.PI * 2

/**
 * Wrap a closed belt anti-clockwise around a convex set of circles.
 *
 * The kit's own `beltPath` does the same tangent-and-arc construction, but it
 * resolves each wrap angle by pushing the outgoing tangent up until it clears
 * the incoming one. A T-34 has no return rollers, so the top run lies
 * straight across five identical wheels and every one of those wraps is
 * exactly zero — which is the one case where that rule can add a whole extra
 * turn. Normalising the difference into [0, 2π) and treating a full turn as
 * the tangency it really is gets the 72-link run the manual specifies.
 */
function wrapBelt(circles: Circle[]): { points: BeltPoint[]; length: number } {
  const n = circles.length
  const tangent: number[] = []
  for (let i = 0; i < n; i++) {
    const c1 = circles[i]
    const c2 = circles[(i + 1) % n]
    const dx = c2.x - c1.x
    const dy = c2.y - c1.y
    const L = Math.hypot(dx, dy)
    const alpha = Math.atan2(dy, dx)
    const beta = Math.acos(Math.max(-1, Math.min(1, (c1.r - c2.r) / L)))
    tangent.push(alpha - beta)
  }

  const raw: { x: number; y: number; angle: number }[] = []
  for (let i = 0; i < n; i++) {
    const c = circles[i]
    const a0 = tangent[(i - 1 + n) % n]
    let arc = (tangent[i] - a0) % TAU
    if (arc < 0) arc += TAU
    if (arc > TAU - 1e-4) arc = 0
    const steps = Math.max(1, Math.ceil(arc / 0.2))
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (arc * k) / steps
      raw.push({
        x: c.x + Math.cos(a) * c.r,
        y: c.y + Math.sin(a) * c.r,
        angle: a + Math.PI / 2,
      })
    }
  }

  const points: BeltPoint[] = []
  let s = 0
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) s += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y)
    points.push({ ...raw[i], s })
  }
  const last = raw[raw.length - 1]
  return { points, length: s + Math.hypot(raw[0].x - last.x, raw[0].y - last.y) }
}

/**
 * Lay the belt round the idler, over the wheels, about the sprocket and back
 * along the ground. Each wheel appears twice — once for the top run and once
 * for the bottom — which is exactly how the track lies on a vehicle with no
 * return rollers.
 */
function trackBelt() {
  const circles: Circle[] = [
    { x: IDLER.z, y: IDLER.y, r: IDLER.r },
    ...WHEEL_Z.map((z) => ({ x: z, y: WHEEL_R, r: WHEEL_R })),
    { x: SPROCKET.z, y: SPROCKET.y, r: SPROCKET.r },
    ...[...WHEEL_Z].reverse().map((z) => ({ x: z, y: WHEEL_R, r: WHEEL_R })),
  ]
  const belt = wrapBelt(circles)
  // Even, so flat links and horned links alternate all the way round without
  // two of a kind meeting at the join.
  const links = Math.round(belt.length / TRACK_PITCH / 2) * 2
  const pitch = belt.length / links

  // Which way is the inside of the loop? The guide horns must face the road
  // wheels, and whether that is local +Y or −Y depends on which way round the
  // tangent construction wound the belt. Ask the bottom of the run.
  let lowest = 0
  let best = Infinity
  for (let i = 0; i < 64; i++) {
    const p = sampleBelt(belt, (i / 64) * belt.length)
    if (p.y < best) {
      best = p.y
      lowest = p.angle
    }
  }
  const horn = Math.cos(lowest) > 0 ? 1 : -1

  return { belt, links, pitch, horn }
}

/** One link: 500 mm of cast steel, with or without its guide horn. */
function trackLinkGeometry(pitch: number, horn: number, horned: boolean) {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const plate: Finish = { base: '#565550', grime: 0.3, scuff: 0.85, scale: 0.09 }
  pieces.push({ geo: box(TRACK_W, 0.03, pitch * 0.9), finish: plate })
  // Grousers on the face that meets the ground.
  pieces.push({
    geo: put(box(TRACK_W * 0.9, 0.028, pitch * 0.3), { y: -horn * 0.026 }),
    finish: plate,
  })
  // End connectors, which is where the pins live.
  for (const s of [1, -1]) {
    pieces.push({
      geo: put(cyl(0.024, 0.024, TRACK_W * 0.94, 6), {
        rz: Math.PI / 2,
        z: (s * pitch) / 2,
      }),
      finish: plate,
    })
  }
  if (horned) {
    pieces.push({
      geo: put(box(0.05, 0.1, pitch * 0.55), { y: horn * 0.062 }),
      finish: plate,
    })
  }
  return weld(pieces)
}

// --- Fenders and stowage ----------------------------------------------------

/** Mudguard for one side. The front corner is always crumpled; they all were. */
function fenderGeometry(sign: number) {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const x = sign * 1.28
  const y = 0.97
  const add = (geo: THREE.BufferGeometry, finish: Finish = GREEN_MUD) => pieces.push({ geo, finish })

  add(put(box(0.62, 0.025, 4.55), { x, y, z: -0.05 }))
  // Outer lip, folded down.
  add(put(box(0.025, 0.07, 4.55), { x: x + sign * 0.3, y: y - 0.03, z: -0.05 }))
  // Front: three short panels, each bent a little differently, which is what
  // happens to sheet metal that has been reversed into things for two years.
  add(put(box(0.6, 0.025, 0.42), { rx: 0.16, rz: sign * 0.07, x, y: y + 0.02, z: 2.4 }))
  add(put(box(0.56, 0.025, 0.36), { rx: -0.34, rz: -sign * 0.13, x: x - sign * 0.02, y: y + 0.03, z: 2.76 }))
  add(put(box(0.5, 0.025, 0.3), { rx: 0.62, rz: sign * 0.2, x: x - sign * 0.04, y: y - 0.02, z: 3.02 }))
  // Rear, sloping away over the sprocket.
  add(put(box(0.6, 0.025, 0.66), { rx: -0.3, x, y: y - 0.05, z: -2.55 }))
  add(put(box(0.56, 0.025, 0.3), { rx: -0.75, x, y: y - 0.22, z: -2.95 }))
  // Brackets back to the sponson.
  for (const z of [2.0, 0.9, -0.3, -1.5, -2.4]) {
    add(put(box(0.34, 0.16, 0.04), { rz: sign * 0.5, x: x - sign * 0.16, y: y + 0.07, z }), GREEN)
  }
  return weld(pieces)
}

/**
 * What the crew bolted on. Port carries the tow cable and the two-man saw;
 * starboard the tool boxes and the crowbar. Both carry a pair of the
 * cylindrical 90-litre fuel tanks that gave the vehicle its road range.
 */
function stowageGeometry(sign: number) {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const x = sign * 1.3
  const add = (geo: THREE.BufferGeometry, finish: Finish) => pieces.push({ geo, finish })

  // External fuel tanks on the rear fender, on their strap cradles.
  for (const z of [-1.35, -2.3]) {
    add(put(tube(0.175, 0.86, 16), { x, y: 1.17, z }), GREEN)
    add(put(ring(0.19, 0.016, Math.PI * 2, 12), { rx: Math.PI / 2, x, y: 1.17, z: z + 0.3 }), TOOLS)
    add(put(ring(0.19, 0.016, Math.PI * 2, 12), { rx: Math.PI / 2, x, y: 1.17, z: z - 0.3 }), TOOLS)
  }

  if (sign > 0) {
    // Tow cable, coiled forward of the tanks with an eye at each end.
    add(
      rope(
        [
          [x - 0.1, 1.02, 1.9],
          [x + 0.06, 1.05, 1.2],
          [x - 0.08, 1.02, 0.5],
          [x + 0.06, 1.05, -0.2],
          [x - 0.06, 1.02, -0.75],
        ],
        0.028,
        5,
      ),
      TOOLS,
    )
    for (const z of [1.9, -0.75]) {
      add(put(ring(0.075, 0.022, Math.PI * 2, 10), { rx: Math.PI / 2, x: x - 0.08, y: 1.02, z }), TOOLS)
    }
    // Two-man crosscut saw in its clips.
    add(put(box(0.02, 0.16, 1.12), { x: x + 0.24, y: 1.06, z: 0.9 }), TOOLS)
    for (let i = 0; i < 14; i++) {
      add(put(box(0.02, 0.04, 0.05), { x: x + 0.24, y: 0.97, z: 0.36 + i * 0.08 }), TOOLS)
    }
  } else {
    // Tool boxes and the crowbar.
    add(put(box(0.36, 0.22, 0.72), { x, y: 1.09, z: 1.5 }), GREEN)
    add(put(box(0.36, 0.22, 0.56), { x, y: 1.09, z: 0.55 }), GREEN)
    for (const z of [1.5, 0.55]) {
      add(put(box(0.38, 0.03, 0.06), { x, y: 1.2, z }), TOOLS)
    }
    add(put(tube(0.022, 1.3, 8), { x: x + 0.24, y: 1.02, z: -0.3 }), TOOLS)
    // Spare track links on the rear fender, bolted flat.
    for (let i = 0; i < 3; i++) {
      add(put(box(0.46, 0.05, TRACK_PITCH * 0.9), { x, y: 1.02, z: -0.85 - i * 0.19 }), TOOLS)
    }
  }
  return weld(pieces)
}

// --- Powerplant -------------------------------------------------------------

/** The V-2-34, under the deck: an aluminium V-12 of 38.9 litres. */
function engineGeometry() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const add = (geo: THREE.BufferGeometry, finish: Finish = MACHINERY) => pieces.push({ geo, finish })

  add(put(box(0.78, 0.46, 1.2), { y: 0.82, z: -1.7 }))
  // Two banks of six at 60°.
  for (const s of [1, -1]) {
    add(put(box(0.34, 0.42, 1.1), { rz: s * 0.52, x: s * 0.3, y: 1.16, z: -1.7 }))
    for (let i = 0; i < 6; i++) {
      add(
        put(cyl(0.05, 0.05, 0.22, 8), {
          rz: s * 0.52,
          x: s * 0.46,
          y: 1.32,
          z: -2.15 + i * 0.18,
        }),
        EXHAUST,
      )
    }
    // Exhaust manifold running back to the rear plate.
    add(put(tube(0.055, 1.3, 10), { x: s * 0.52, y: 1.3, z: -2.0 }), EXHAUST)
  }
  // Flywheel, clutch and the gearbox behind it.
  add(put(cyl(0.28, 0.28, 0.12, 16), { rx: Math.PI / 2, y: 0.85, z: -2.42 }))
  add(put(box(1.2, 0.58, 0.44), { y: 0.78, z: -2.72 }))
  // Final drives out to the sprockets.
  for (const s of [1, -1]) {
    add(put(cyl(0.22, 0.26, 0.5, 14), { rz: Math.PI / 2, x: s * 0.72, y: 0.66, z: -2.6 }))
  }
  return weld(pieces)
}

// --- Hull machine gun -------------------------------------------------------

function hullMgGeometry() {
  return weld([
    { geo: onGlacis(sph(0.19, 14), -0.46, 0.5, -0.02), finish: CASTING },
    { geo: onGlacis(cyl(0.11, 0.13, 0.1, 14), -0.46, 0.5, 0.12), finish: CASTING },
    { geo: put(tube(0.032, 0.44, 10), { x: -0.46, y: 1.15, z: 2.78, rx: -0.1 }), finish: TOOLS },
    // The DT's telescope, off to one side and nearly useless.
    { geo: onGlacis(tube(0.035, 0.12, 8), -0.62, 0.62, 0.05), finish: TOOLS },
  ])
}

// --- Markings ---------------------------------------------------------------

/**
 * The turret number, painted on with a brush and a stencil that did not
 * quite fit. Drawn to a canvas rather than loaded, so there is still no
 * asset in this museum that did not come out of a number.
 */
export function turretNumberTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')
  if (!g) return null
  g.clearRect(0, 0, 256, 128)
  g.fillStyle = '#e8e6dc'
  g.font = 'bold 96px ui-serif, Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 66)
  // Wear: knock holes in the paint so it reads as brushwork, not decal.
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 260; i++) {
    const n = Math.sin(i * 12.9898) * 43758.5453
    const a = n - Math.floor(n)
    const m = Math.sin(i * 78.233) * 43758.5453
    const b = m - Math.floor(m)
    g.beginPath()
    g.arc(a * 256, b * 128, 1 + b * 5, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * A patch of the turret's own surface to carry the number, cut as a cone so
 * it follows the 23° of the casting instead of floating off it.
 */
function turretDecalGeometry(sign: number) {
  const yLo = 0.34
  const yHi = 0.62
  // `turretRadius` measures from +X; the cylinder's theta measures from +Z.
  const bearing = sign > 0 ? 0 : Math.PI
  const rLo = turretRadius(yLo, bearing) + 0.012
  const rHi = turretRadius(yHi, bearing) + 0.012
  const arc = 0.48 / rLo
  const theta = (sign > 0 ? Math.PI / 2 : -Math.PI / 2) - arc / 2
  const g = new THREE.CylinderGeometry(rHi, rLo, yHi - yLo, 12, 1, true, theta, arc)
  g.translate(0, (yLo + yHi) / 2, 0)
  return g
}

// --- The lot ----------------------------------------------------------------

export function buildT34() {
  const track = trackBelt()
  return {
    hull: hullGeometry(),
    driverHatch: driverHatchGeometry(),
    deck: deckGeometry(),
    hullMg: hullMgGeometry(),
    turret: turretGeometry(),
    cupola: cupolaGeometry(),
    cupolaLeafA: cupolaLeafGeometry(1),
    cupolaLeafB: cupolaLeafGeometry(-1),
    loaderHatch: loaderHatchGeometry(),
    mantlet: mantletGeometry(),
    gun: gunGeometry(),
    wheel: roadWheelGeometry(),
    sprocket: sprocketGeometry(),
    idler: idlerGeometry(),
    idlerCrank: idlerCrankGeometry(),
    arm: armGeometry(),
    springs: springGeometry(),
    fenderPort: fenderGeometry(1),
    fenderStbd: fenderGeometry(-1),
    stowagePort: stowageGeometry(1),
    stowageStbd: stowageGeometry(-1),
    engine: engineGeometry(),
    belt: track.belt,
    links: track.links,
    pitch: track.pitch,
    linkFlat: trackLinkGeometry(track.pitch, track.horn, false),
    linkHorn: trackLinkGeometry(track.pitch, track.horn, true),
    decalPort: turretDecalGeometry(1),
    decalStbd: turretDecalGeometry(-1),
    turretFront: turretRadius(TRUNNION.y, Math.PI / 2),
  }
}

export type T34Geometry = ReturnType<typeof buildT34>
