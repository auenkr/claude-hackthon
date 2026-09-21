import * as THREE from 'three'
import { loft, loftSuper, strut, type SuperSection } from '../geometry'
import { weld, type Finish } from '../t34/paint'
import {
  DISC_F,
  DISC_R,
  ENGINE_FACE,
  EXHAUST_TIPS,
  FRONT_R,
  FRONT_W,
  FRONT_Z,
  NOSE_JOINT,
  NOSE_TIP,
  PICKUP_F,
  PICKUP_R,
  REAR_R,
  REAR_W,
  REAR_Z,
  RIM_F,
  RIM_R,
  STEERING_WHEEL,
  TUB_Y,
  UPRIGHT_F,
  UPRIGHT_R,
  WING,
} from './dims'

/**
 * The metal, and the glassfibre.
 *
 * Every assembly is built from the figures in `dims.ts`, painted with the
 * museum's vertex-colour rules and welded into one buffer per catalogued
 * part. The finish here is a works car after a race, not a museum piece:
 * Team Lotus green with the yellow stripe, rubber dust climbing the sides of
 * the tub, brake dust on the magnesium and soot behind the megaphones.
 */

// --- Primitives -------------------------------------------------------------

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).toNonIndexed()
const cyl = (rt: number, rb: number, h: number, seg = 14) =>
  new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed()
const sph = (r: number, seg = 14) =>
  new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)).toNonIndexed()
const ring = (r: number, thick: number, arc = Math.PI * 2, seg = 24) =>
  new THREE.TorusGeometry(r, thick, 7, seg, arc).toNonIndexed()

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

/** A tube between two points. `strut` leaves positions only; give it normals. */
function bar(a: [number, number, number], b: [number, number, number], r: number, sides = 8) {
  const g = strut(a, b, r, sides)
  g.computeVertexNormals()
  return g
}

type Piece = { geo: THREE.BufferGeometry; finish: Finish }

// --- Finishes ---------------------------------------------------------------

/** Team Lotus British racing green, a season old. */
const GREEN: Finish = { base: '#1c472c', grime: 0.08, scuff: 0.12, scale: 0.5 }
/** The tub sides, which the rear tyres pepper with rubber. */
const GREEN_LOW: Finish = { ...GREEN, grime: 0.22, scuff: 0.18 }
const YELLOW: Finish = { base: '#e6b722', grime: 0.06, scuff: 0.08, scale: 0.4 }
const ALU: Finish = { base: '#a9aeb5', grime: 0.15, scuff: 0.55, scale: 0.2 }
const STEEL: Finish = { base: '#5a5e65', grime: 0.2, scuff: 0.6, scale: 0.15 }
/** Cast magnesium, matt, with brake dust on the outer face. */
const MAG: Finish = { base: '#8b8578', grime: 0.4, scuff: 0.3, scale: 0.14 }
const TYRE: Finish = { base: '#1c1c1f', grime: 0.3, scuff: 0.06, scale: 0.1 }
const IRON: Finish = { base: '#5f6268', grime: 0.5, scuff: 0.3, scale: 0.22 }
const CAM: Finish = { base: '#3a3d43', grime: 0.45, scuff: 0.25, scale: 0.2 }
/** Exhaust, blued and sooted in a few laps. */
const HOT: Finish = { base: '#6b5443', grime: 0.7, scuff: 0.45, scale: 0.18 }
const LEATHER: Finish = { base: '#3b2a1d', grime: 0.3, scuff: 0.2, scale: 0.15 }
const DARK: Finish = { base: '#25272b', grime: 0.3, scuff: 0.1, scale: 0.3 }
const GLASS_FRAME: Finish = { base: '#222428', grime: 0.1, scuff: 0.2, scale: 0.2 }
/** The driver: dark blue overalls, dark blue helmet with a white peak. */
const OVERALLS: Finish = { base: '#22355e', grime: 0.15, scuff: 0.05, scale: 0.25 }
const HELMET: Finish = { base: '#1d2f5e', grime: 0.05, scuff: 0.15, scale: 0.4 }
const PEAK: Finish = { base: '#e8e6df', grime: 0.05, scuff: 0.1, scale: 0.3 }
const SPRING: Finish = { base: '#8a2a2a', grime: 0.3, scuff: 0.3, scale: 0.12 }
const RUBBER_BAND: Finish = { base: '#e9e7df', grime: 0.15, scuff: 0.2, scale: 0.12 }

// --- Lofts ------------------------------------------------------------------

/** The stressed-skin tub: a softened box, widest at the cockpit. */
const TUB: SuperSection[] = [
  { z: NOSE_JOINT, y: TUB_Y - 0.02, halfWidth: 0.28, top: 0.22, bottom: 0.26, power: 3.2 },
  { z: 1.1, y: TUB_Y - 0.01, halfWidth: 0.33, top: 0.26, bottom: 0.27, power: 3.2 },
  { z: 0.6, y: TUB_Y, halfWidth: 0.36, top: 0.28, bottom: 0.28, power: 3.2 },
  { z: 0.0, y: TUB_Y, halfWidth: 0.36, top: 0.25, bottom: 0.28, power: 3.2 },
  { z: ENGINE_FACE, y: TUB_Y, halfWidth: 0.34, top: 0.21, bottom: 0.28, power: 3.2 },
]

/** Glassfibre nose, open at the tip: the oval is the radiator intake. */
const NOSE: SuperSection[] = [
  { z: NOSE_JOINT, y: TUB_Y - 0.02, halfWidth: 0.28, top: 0.22, bottom: 0.26, power: 2.6 },
  { z: 1.85, y: 0.35, halfWidth: 0.23, top: 0.17, bottom: 0.21, power: 2.4 },
  { z: 2.08, y: 0.34, halfWidth: 0.18, top: 0.125, bottom: 0.15, power: 2.3 },
  { z: NOSE_TIP, y: 0.34, halfWidth: 0.155, top: 0.1, bottom: 0.115, power: 2.2 },
]

function crownAt(z: number) {
  const run = [...(z > NOSE_JOINT ? NOSE : TUB)].sort((a, b) => a.z - b.z)
  let i = 0
  while (i < run.length - 2 && run[i + 1].z < z) i++
  const p = run[i]
  const q = run[i + 1]
  const f = THREE.MathUtils.clamp((z - p.z) / (q.z - p.z), 0, 1)
  return p.y + p.top + (q.y + q.top - p.y - p.top) * f
}

/** The yellow stripe, laid as a ribbon along the crown between z0 and z1. */
function stripe(z0: number, z1: number) {
  const rings: THREE.Vector3[][] = []
  for (let z = z0; z <= z1 + 1e-6; z += 0.06) {
    const y = crownAt(Math.min(z, z1))
    const w = z > NOSE_JOINT ? 0.05 + 0.02 * (NOSE_TIP - z) : 0.07
    rings.push([
      new THREE.Vector3(-w, y + 0.007, z),
      new THREE.Vector3(w, y + 0.007, z),
      new THREE.Vector3(w, y - 0.012, z),
      new THREE.Vector3(-w, y - 0.012, z),
    ])
  }
  const g = loft(rings, { capStart: false, capEnd: false })
  g.computeVertexNormals()
  return g
}

// --- Assemblies -------------------------------------------------------------

function tub() {
  const shell = loftSuper(TUB, 28)
  shell.computeVertexNormals()
  const pieces: Piece[] = [
    { geo: shell, finish: GREEN_LOW },
    { geo: stripe(ENGINE_FACE + 0.02, NOSE_JOINT), finish: YELLOW },
    // Front bulkhead and the rack sitting on it.
    { geo: put(box(0.5, 0.42, 0.04), { y: TUB_Y - 0.02, z: 1.53 }), finish: ALU },
    { geo: put(cyl(0.02, 0.02, 0.44, 10), { rz: Math.PI / 2, y: PICKUP_F.rack.y, z: PICKUP_F.rack.z }), finish: STEEL },
    // Radiator core behind the intake, and the header tank above it.
    { geo: put(box(0.42, 0.34, 0.07), { y: 0.4, z: 1.66 }), finish: DARK },
    { geo: put(cyl(0.05, 0.05, 0.3, 10), { rz: Math.PI / 2, y: 0.6, z: 1.6 }), finish: ALU },
    // Fuel fillers, one each side on the scuttle.
    { geo: put(cyl(0.045, 0.045, 0.02, 12), { x: 0.24, y: crownAt(0.95) + 0.005, z: 0.95 }), finish: ALU },
    { geo: put(cyl(0.045, 0.045, 0.02, 12), { x: -0.24, y: crownAt(0.95) + 0.005, z: 0.95 }), finish: ALU },
  ]
  // Panel seams where the skins are riveted: three thin dark bands.
  for (const z of [1.1, 0.6, 0.0]) {
    const s = TUB.find((t) => Math.abs(t.z - z) < 1e-6)!
    const seam = loftSuper(
      [
        { ...s, z: z + 0.006, halfWidth: s.halfWidth + 0.003, top: s.top + 0.003, bottom: s.bottom + 0.003 },
        { ...s, z: z - 0.006, halfWidth: s.halfWidth + 0.003, top: s.top + 0.003, bottom: s.bottom + 0.003 },
      ],
      28,
      { capStart: false, capEnd: false },
    )
    seam.computeVertexNormals()
    pieces.push({ geo: seam, finish: DARK })
  }
  return weld(pieces)
}

function nose() {
  const shell = loftSuper(NOSE, 28, { capStart: false, capEnd: false })
  shell.computeVertexNormals()
  const lip = loftSuper(
    [
      { z: 2.13, y: 0.34, halfWidth: 0.17, top: 0.115, bottom: 0.13, power: 2.2 },
      { z: NOSE_TIP, y: 0.34, halfWidth: 0.16, top: 0.105, bottom: 0.12, power: 2.2 },
    ],
    28,
    { capStart: false, capEnd: false },
  )
  lip.computeVertexNormals()
  return weld([
    { geo: shell, finish: GREEN },
    { geo: stripe(NOSE_JOINT + 0.02, NOSE_TIP - 0.02), finish: YELLOW },
    { geo: lip, finish: YELLOW },
    // Dzus fasteners along the joint.
    ...[-0.22, -0.11, 0.11, 0.22].map((x) => ({
      geo: put(cyl(0.012, 0.012, 0.006, 8), { rx: Math.PI / 2, x, y: TUB_Y + 0.19, z: NOSE_JOINT + 0.03 }),
      finish: ALU,
    })),
  ])
}

/** Cockpit surround, headrest fairing, roll hoop and mirrors. */
function cockpit() {
  const headrest = loftSuper(
    [
      { z: 0.08, y: 0.66, halfWidth: 0.17, top: 0.16, bottom: 0.01, power: 2.6 },
      { z: -0.12, y: 0.65, halfWidth: 0.14, top: 0.11, bottom: 0.01, power: 2.6 },
      { z: -0.3, y: 0.62, halfWidth: 0.1, top: 0.04, bottom: 0.01, power: 2.6 },
    ],
    20,
  )
  headrest.computeVertexNormals()
  const pieces: Piece[] = [
    { geo: headrest, finish: GREEN },
    // The opening and the seat pan in it.
    { geo: put(box(0.46, 0.03, 0.7), { y: 0.655, z: 0.46 }), finish: DARK },
    { geo: put(box(0.4, 0.04, 0.5), { y: 0.5, z: 0.35 }), finish: LEATHER },
    // Roll hoop: one low bar, 1967 protection.
    { geo: put(ring(0.2, 0.017, Math.PI, 24), { y: 0.7, z: -0.02 }), finish: ALU },
    { geo: put(cyl(0.017, 0.017, 0.08, 10), { x: 0.2, y: 0.67, z: -0.02 }), finish: ALU },
    { geo: put(cyl(0.017, 0.017, 0.08, 10), { x: -0.2, y: 0.67, z: -0.02 }), finish: ALU },
    // Windscreen frame; the pane itself is glass, drawn separately.
    { geo: put(ring(0.27, 0.008, Math.PI, 20), { rx: -0.35, y: 0.66, z: 0.8 }), finish: GLASS_FRAME },
    // Steering column.
    { geo: bar([0, 0.5, 0.95], [0, STEERING_WHEEL.y - 0.02, STEERING_WHEEL.z + 0.06], 0.014), finish: STEEL },
    // Gear lever on the right, as on the car.
    { geo: bar([0.26, 0.5, 0.5], [0.3, 0.68, 0.42], 0.008), finish: STEEL },
    { geo: put(sph(0.02, 10), { x: 0.3, y: 0.69, z: 0.42 }), finish: DARK },
  ]
  // Mirrors on stalks, either side of the screen.
  for (const side of [1, -1]) {
    pieces.push(
      { geo: put(cyl(0.006, 0.006, 0.08, 6), { x: side * 0.36, y: 0.69, z: 0.78 }), finish: STEEL },
      { geo: put(box(0.08, 0.05, 0.02), { x: side * 0.36, y: 0.74, z: 0.78 }), finish: DARK },
    )
  }
  return weld(pieces)
}

/** The screen: a low wrap-round pane. Glass, so it gets its own material. */
function screen() {
  const g = loftSuper(
    [
      { z: 0.92, y: 0.66, halfWidth: 0.2, top: 0.03, bottom: 0.0, power: 2.4 },
      { z: 0.8, y: 0.66, halfWidth: 0.26, top: 0.12, bottom: 0.0, power: 2.4 },
      { z: 0.7, y: 0.66, halfWidth: 0.28, top: 0.15, bottom: 0.0, power: 2.5 },
    ],
    20,
    { capStart: false, capEnd: false },
  )
  g.computeVertexNormals()
  return g
}

/** The wheel rim and its three spokes, built about its own centre so it can turn. */
function steeringWheel() {
  const r = STEERING_WHEEL.r
  const pieces: Piece[] = [{ geo: ring(r, 0.014, Math.PI * 2, 32), finish: LEATHER }]
  for (let i = 0; i < 3; i++) {
    pieces.push({ geo: put(box(0.02, r, 0.012), { rz: (i * Math.PI * 2) / 3, y: 0 }), finish: ALU })
  }
  pieces.push({ geo: put(cyl(0.03, 0.03, 0.02, 12), { rx: Math.PI / 2 }), finish: DARK })
  return weld(pieces)
}

/** Torso, shoulders and arms reaching the wheel. The helmet is separate: it turns. */
function driverBody() {
  const pieces: Piece[] = [
    // Reclined torso.
    { geo: put(box(0.34, 0.18, 0.55), { rx: -0.35, y: 0.6, z: 0.3 }), finish: OVERALLS },
    // Shoulders.
    { geo: put(cyl(0.09, 0.09, 0.4, 10), { rz: Math.PI / 2, y: 0.7, z: 0.12 }), finish: OVERALLS },
    // Legs disappearing under the scuttle.
    { geo: put(box(0.3, 0.14, 0.5), { y: 0.5, z: 0.85 }), finish: OVERALLS },
  ]
  // Arms from the shoulders to the rim.
  for (const side of [1, -1]) {
    pieces.push(
      { geo: bar([side * 0.2, 0.7, 0.12], [side * 0.14, STEERING_WHEEL.y + 0.02, STEERING_WHEEL.z - 0.02], 0.032), finish: OVERALLS },
      { geo: put(sph(0.035, 10), { x: side * 0.135, y: STEERING_WHEEL.y + 0.03, z: STEERING_WHEEL.z - 0.01 }), finish: LEATHER },
    )
  }
  return weld(pieces)
}

/** Helmet about its own centre. Dark blue with a white peak and a dark visor. */
function helmet() {
  return weld([
    { geo: sph(0.135, 18), finish: HELMET },
    { geo: put(box(0.2, 0.012, 0.09), { rx: 0.25, y: 0.03, z: 0.13 }), finish: PEAK },
    { geo: put(box(0.19, 0.06, 0.02), { y: -0.01, z: 0.125 }), finish: DARK },
  ])
}

/** The DFV: block, two banks at 90°, cam covers, eight trumpets, bell housing. */
function engine() {
  const pieces: Piece[] = [
    { geo: put(box(0.44, 0.34, 0.68), { y: 0.4, z: -0.65 }), finish: IRON },
    { geo: put(box(0.5, 0.4, 0.04), { y: 0.4, z: ENGINE_FACE - 0.01 }), finish: ALU },
    // Sump and oil pump below the block.
    { geo: put(box(0.36, 0.1, 0.5), { y: 0.2, z: -0.65 }), finish: IRON },
    // Alternator and water pump on the front face.
    { geo: put(cyl(0.05, 0.05, 0.1, 12), { rx: Math.PI / 2, x: 0.16, y: 0.24, z: -0.36 }), finish: STEEL },
  ]
  for (const side of [1, -1]) {
    pieces.push(
      { geo: put(box(0.24, 0.2, 0.64), { rz: side * 45 * DEG_, x: side * 0.2, y: 0.55, z: -0.65 }), finish: IRON },
      { geo: put(box(0.16, 0.05, 0.6), { rz: side * 45 * DEG_, x: side * 0.29, y: 0.64, z: -0.65 }), finish: CAM },
    )
    for (const z of [-0.42, -0.56, -0.7, -0.84]) {
      pieces.push({ geo: put(cyl(0.045, 0.03, 0.14, 12), { x: side * 0.085, y: 0.78, z }), finish: ALU })
    }
    // Ignition leads along each cam cover.
    pieces.push({ geo: bar([side * 0.3, 0.7, -0.38], [side * 0.3, 0.7, -0.92], 0.006, 5), finish: DARK })
  }
  return weld(pieces)
}

/** ZF 5DS-25 transaxle, with the oil tank on top and the rear plate. */
function gearbox() {
  return weld([
    { geo: put(box(0.3, 0.32, 0.56), { y: 0.38, z: -1.28 }), finish: IRON },
    { geo: put(cyl(0.19, 0.19, 0.08, 20), { rx: Math.PI / 2, y: 0.38, z: -1.02 }), finish: ALU },
    { geo: put(box(0.26, 0.28, 0.05), { y: 0.38, z: -1.58 }), finish: ALU },
    { geo: put(cyl(0.07, 0.07, 0.3, 14), { y: 0.62, z: -1.28 }), finish: ALU },
    // Rear bulkhead the wing struts and radius rods pick up on.
    { geo: put(box(0.36, 0.06, 0.06), { y: 0.56, z: -1.44 }), finish: STEEL },
  ])
}

/** Four primaries into a collector and a megaphone, one side. */
function exhaust(side: number) {
  const pieces: Piece[] = []
  for (let i = 0; i < 4; i++) {
    pieces.push({
      geo: bar([side * 0.34, 0.5, -0.42 - i * 0.14], [side * 0.27, 0.56, -1.12], 0.021, 8),
      finish: HOT,
    })
  }
  const tip = EXHAUST_TIPS[side > 0 ? 0 : 1]
  pieces.push(
    { geo: put(cyl(0.036, 0.048, 0.5, 12), { rx: Math.PI / 2, x: tip[0], y: tip[1], z: -1.36 }), finish: HOT },
    { geo: put(cyl(0.048, 0.062, 0.26, 12), { rx: Math.PI / 2, x: tip[0], y: tip[1], z: tip[2] + 0.11 }), finish: HOT },
  )
  return weld(pieces)
}

/**
 * A wishbone built about its inboard pivot at the origin, reaching out to
 * the upright. Rotating the group about Z follows the wheel through its
 * travel exactly as the real arm does.
 */
function wishbone(reachX: number, dy: number, zFore: number, zAft: number, zBall: number, r = 0.014) {
  return weld([
    { geo: bar([0, 0, zFore], [reachX, dy, zBall], r), finish: STEEL },
    { geo: bar([0, 0, zAft], [reachX, dy, zBall], r), finish: STEEL },
    { geo: put(sph(r * 1.7, 8), { x: reachX, y: dy, z: zBall }), finish: STEEL },
  ])
}

function frontUpper(side: number) {
  const reach = side * (UPRIGHT_F.x - PICKUP_F.upper.x)
  return wishbone(reach, UPRIGHT_F.y + 0.16 - PICKUP_F.upper.y, PICKUP_F.zFore, PICKUP_F.zAft, FRONT_Z)
}
function frontLower(side: number) {
  const reach = side * (UPRIGHT_F.x - PICKUP_F.lower.x)
  return wishbone(reach, UPRIGHT_F.y - 0.14 - PICKUP_F.lower.y, PICKUP_F.zFore, PICKUP_F.zAft, FRONT_Z, 0.016)
}
function rearTop(side: number) {
  return weld([
    { geo: bar([0, 0, 0], [side * (UPRIGHT_R.x - PICKUP_R.top.x), UPRIGHT_R.y + 0.16 - PICKUP_R.top.y, REAR_Z - PICKUP_R.top.z], 0.014), finish: STEEL },
  ])
}
function rearLower(side: number) {
  const reach = side * (UPRIGHT_R.x - PICKUP_R.lower.x)
  return wishbone(reach, UPRIGHT_R.y - 0.15 - PICKUP_R.lower.y, PICKUP_R.zFore, PICKUP_R.zAft, REAR_Z, 0.016)
}

/** What does not move with the wheel: steering arm, radius rods, springs, driveshaft. */
function frontStatic(side: number) {
  const s = PICKUP_F.spring
  return weld([
    // Steering arm from the rack to the upright.
    { geo: bar([side * 0.2, PICKUP_F.rack.y, PICKUP_F.rack.z], [side * 0.56, 0.34, 1.29], 0.011), finish: STEEL },
    // Coil-over: damper body and the spring around it.
    { geo: bar([side * s.top.x, s.top.y, s.top.z], [side * s.bottom.x, s.bottom.y, FRONT_Z], 0.012), finish: STEEL },
    { geo: bar([side * (s.top.x + 0.02), s.top.y - 0.03, s.top.z - 0.02], [side * (s.bottom.x - 0.02), s.bottom.y + 0.04, FRONT_Z + 0.02], 0.038, 12), finish: SPRING },
  ])
}
function rearStatic(side: number) {
  const s = PICKUP_R.spring
  return weld([
    // Twin radius rods forward to the back of the tub.
    { geo: bar([side * 0.6, 0.46, REAR_Z], [side * 0.34, 0.5, ENGINE_FACE], 0.013), finish: STEEL },
    { geo: bar([side * 0.6, 0.22, REAR_Z], [side * 0.34, 0.3, ENGINE_FACE], 0.013), finish: STEEL },
    { geo: bar([side * s.top.x, s.top.y, s.top.z], [side * s.bottom.x, s.bottom.y, REAR_Z], 0.012), finish: STEEL },
    { geo: bar([side * (s.top.x + 0.02), s.top.y - 0.03, s.top.z - 0.02], [side * (s.bottom.x - 0.02), s.bottom.y + 0.04, REAR_Z + 0.02], 0.038, 12), finish: SPRING },
    // Driveshaft with its two universal joints.
    { geo: bar([side * 0.16, 0.36, REAR_Z], [side * 0.58, 0.34, REAR_Z], 0.02, 10), finish: STEEL },
    { geo: put(cyl(0.035, 0.035, 0.05, 10), { rz: Math.PI / 2, x: side * 0.2, y: 0.36, z: REAR_Z }), finish: STEEL },
    { geo: put(cyl(0.035, 0.035, 0.05, 10), { rz: Math.PI / 2, x: side * 0.54, y: 0.34, z: REAR_Z }), finish: STEEL },
  ])
}

/** The upright casting about its own centre. */
function upright(tall: number) {
  return weld([
    { geo: box(0.06, tall, 0.1), finish: ALU },
    { geo: put(cyl(0.05, 0.05, 0.09, 12), { rz: Math.PI / 2 }), finish: STEEL },
  ])
}

/** A treaded tyre on a cast magnesium wheel with a knock-off hub, about its axle. */
function wheel(radius: number, width: number, rim: number, side: number) {
  const pieces: Piece[] = [
    { geo: put(cyl(radius, radius, width, 32), { rz: Math.PI / 2 }), finish: TYRE },
    // Tread grooves: shallow rings cut into the face.
    ...[-0.3, -0.1, 0.1, 0.3].map((f) => ({
      geo: put(ring(radius + 0.001, 0.004, Math.PI * 2, 40), { ry: Math.PI / 2, x: f * width }),
      finish: DARK,
    })),
    { geo: put(cyl(rim, rim, width + 0.02, 28), { rz: Math.PI / 2 }), finish: MAG },
    // Dished centre and the knock-off spinner, on the outside.
    { geo: put(cyl(rim * 0.55, rim * 0.5, 0.03, 18), { rz: Math.PI / 2, x: side * (width / 2 + 0.005) }), finish: MAG },
    { geo: put(cyl(0.04, 0.04, 0.05, 6), { rz: Math.PI / 2, x: side * (width / 2 + 0.035) }), finish: STEEL },
  ]
  // Six spokes in the dish.
  for (let i = 0; i < 6; i++) {
    pieces.push({
      geo: put(box(0.03, rim * 0.9, 0.025), { rx: (i * Math.PI) / 3, x: side * (width / 2 - 0.02) }),
      finish: MAG,
    })
  }
  return weld(pieces)
}

/** The Girling disc, inside the rim. Glows on its own material. */
function disc(r: number) {
  return put(cyl(r, r, 0.02, 32), { rz: Math.PI / 2 })
}

/** The 49B's high wing about its own centre, with end plates. */
function wing() {
  return weld([
    { geo: put(box(WING.span, 0.025, WING.chord), { rx: -8 * DEG_ }), finish: GREEN },
    { geo: put(box(WING.span * 0.9, 0.006, 0.05), { rx: -8 * DEG_, y: 0.014, z: -0.05 }), finish: YELLOW },
    { geo: put(box(0.02, 0.15, 0.4), { x: WING.span / 2 + 0.01, y: 0.02 }), finish: YELLOW },
    { geo: put(box(0.02, 0.15, 0.4), { x: -WING.span / 2 - 0.01, y: 0.02 }), finish: YELLOW },
  ])
}

/** One strut of unit height, from y = 0 to y = 1, to be scaled. */
function strutUnit() {
  return weld([{ geo: put(cyl(0.016, 0.016, 1, 8), { y: 0.5 }), finish: STEEL }])
}

/** A white band on a tyre: the museum's own tell for the exhibit's wheels. */
export function tyreBand(radius: number, width: number) {
  return weld([{ geo: put(ring(radius * 0.72, 0.003, Math.PI * 2, 40), { ry: Math.PI / 2, x: width / 2 + 0.006 }), finish: RUBBER_BAND }])
}

const DEG_ = Math.PI / 180

export function buildLotus49() {
  return {
    tub: tub(),
    nose: nose(),
    cockpit: cockpit(),
    screen: screen(),
    steeringWheel: steeringWheel(),
    driver: driverBody(),
    helmet: helmet(),
    engine: engine(),
    gearbox: gearbox(),
    exhaustR: exhaust(1),
    exhaustL: exhaust(-1),
    frontUpperR: frontUpper(1),
    frontUpperL: frontUpper(-1),
    frontLowerR: frontLower(1),
    frontLowerL: frontLower(-1),
    frontStaticR: frontStatic(1),
    frontStaticL: frontStatic(-1),
    rearTopR: rearTop(1),
    rearTopL: rearTop(-1),
    rearLowerR: rearLower(1),
    rearLowerL: rearLower(-1),
    rearStaticR: rearStatic(1),
    rearStaticL: rearStatic(-1),
    uprightF: upright(0.34),
    uprightR: upright(0.36),
    wheelFR: wheel(FRONT_R, FRONT_W, RIM_F, 1),
    wheelFL: wheel(FRONT_R, FRONT_W, RIM_F, -1),
    wheelRR: wheel(REAR_R, REAR_W, RIM_R, 1),
    wheelRL: wheel(REAR_R, REAR_W, RIM_R, -1),
    discF: disc(DISC_F),
    discR: disc(DISC_R),
    wing: wing(),
    strut: strutUnit(),
  }
}

export type Lotus49Geometry = ReturnType<typeof buildLotus49>
