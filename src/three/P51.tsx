import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import {
  liftingSurface,
  loft,
  loftSuper,
  merge,
  strut,
  type Ring,
  type SuperSection,
  type WingStation,
} from './geometry'
import { P51_STANCE } from './stance'
import { Skin } from './p51/Skin'
import {
  fuselageTexture,
  panelTexture,
  tileUv,
  wingTexture,
  wrapFuselage,
  wrapWing,
} from './p51/livery'
import type { Controls, Mount } from '../types'

/**
 * P-51D Mustang.
 *
 * Model axes: +Z forward through the propeller, +X out the starboard wing,
 * +Y up, all in metres at 1:1. Every station below is either a published
 * dimension or interpolated between two of them.
 *
 * The reconstruction is deliberately detailed down to the things a pilot
 * would have touched — the scissors on the oleo, the six staggered muzzles,
 * the exit flap under the radiator — because those are the parts that tell
 * you what the aeroplane was for. Everything painted on it, from the olive
 * anti-glare panel to the eighteen-inch invasion stripes, is in `p51/livery`.
 */

const DEG = Math.PI / 180

const ALUMINIUM = { color: '#9aa1ab', metalness: 0.92, roughness: 0.28 }
const OLIVE = { color: '#6e7480', metalness: 0.8, roughness: 0.38 }
const RUBBER = { color: '#1b1b1e', metalness: 0.1, roughness: 0.85 }
const STEEL = { color: '#5d626b', metalness: 0.95, roughness: 0.3 }
const CHROME = { color: '#c8ced6', metalness: 1, roughness: 0.12 }
const DARK = { color: '#2a2c31', metalness: 0.5, roughness: 0.6 }
const INTERIOR = { color: '#4a5a4d', metalness: 0.3, roughness: 0.75 }
const LEATHER = { color: '#3a2f27', metalness: 0.1, roughness: 0.9 }
const SOOT = { color: '#5c4433', metalness: 0.62, roughness: 0.72 }

// --- Fuselage loft stations -------------------------------------------------
// Deep belly, and the cut-down rear decking that the bubble hood required.
const FUSELAGE: SuperSection[] = [
  { z: 4.5, y: 0, halfWidth: 0.4, top: 0.38, bottom: 0.34, power: 2.7 },
  { z: 4.0, y: 0, halfWidth: 0.45, top: 0.44, bottom: 0.38, power: 2.6 },
  { z: 3.2, y: 0, halfWidth: 0.47, top: 0.5, bottom: 0.42, power: 2.5 },
  { z: 2.3, y: 0, halfWidth: 0.48, top: 0.53, bottom: 0.46, power: 2.4 },
  { z: 1.4, y: 0, halfWidth: 0.48, top: 0.55, bottom: 0.5, power: 2.3 },
  { z: 0.5, y: 0, halfWidth: 0.47, top: 0.5, bottom: 0.52, power: 2.3 },
  { z: -0.4, y: 0, halfWidth: 0.44, top: 0.4, bottom: 0.52, power: 2.3 },
  { z: -1.4, y: 0, halfWidth: 0.39, top: 0.34, bottom: 0.49, power: 2.2 },
  { z: -2.4, y: 0, halfWidth: 0.32, top: 0.29, bottom: 0.43, power: 2.2 },
  { z: -3.4, y: 0.02, halfWidth: 0.23, top: 0.23, bottom: 0.33, power: 2.1 },
  { z: -4.2, y: 0.04, halfWidth: 0.15, top: 0.17, bottom: 0.23, power: 2.0 },
  { z: -4.73, y: 0.06, halfWidth: 0.05, top: 0.07, bottom: 0.09, power: 2.0 },
]

// --- Wing planform ----------------------------------------------------------
// 11.28 m span, 5° dihedral, 15.1% root section peaking well aft of normal.
const PANEL: WingStation[] = [
  { span: 0.0, chord: 2.59, lead: 1.6, rise: -0.22, thickness: 0.151, twist: 1 },
  { span: 1.2, chord: 2.4, lead: 1.52, rise: -0.115, thickness: 0.145, twist: 0.8 },
  { span: 2.6, chord: 2.1, lead: 1.38, rise: 0.008, thickness: 0.135, twist: 0.4 },
  { span: 4.0, chord: 1.76, lead: 1.2, rise: 0.13, thickness: 0.124, twist: 0 },
  { span: 5.2, chord: 1.42, lead: 1.04, rise: 0.235, thickness: 0.116, twist: -0.6 },
  { span: 5.5, chord: 1.3, lead: 1.0, rise: 0.261, thickness: 0.112, twist: -0.9 },
  { span: 5.64, chord: 0.95, lead: 1.02, rise: 0.273, thickness: 0.1, twist: -1 },
]

/** Interpolate the planform at an arbitrary spanwise station. */
function atSpan(s: number) {
  const a = Math.abs(s)
  let i = 0
  while (i < PANEL.length - 2 && PANEL[i + 1].span < a) i++
  const p = PANEL[i]
  const q = PANEL[i + 1]
  const f = (a - p.span) / (q.span - p.span)
  const mix = (u: number, v: number) => u + (v - u) * f
  return {
    chord: mix(p.chord, q.chord),
    lead: mix(p.lead, q.lead),
    rise: mix(p.rise, q.rise),
    thickness: mix(p.thickness, q.thickness),
  }
}

/** Trailing edge position at a station. */
function trailing(s: number) {
  const st = atSpan(s)
  return { z: st.lead - st.chord, y: st.rise }
}

/**
 * A hinged control surface: a tapered slab built relative to its own hinge,
 * so the group can simply rotate about the real hinge line.
 */
function controlSlab(
  s0: number,
  s1: number,
  chordAt: (s: number) => number,
  side: number,
  thickness = 0.07,
) {
  const hinge = new THREE.Vector3(side * s0, trailing(s0).y, trailing(s0).z)
  const steps = 6
  const rings = []
  for (let i = 0; i <= steps; i++) {
    const s = s0 + ((s1 - s0) * i) / steps
    const te = trailing(s)
    const c = chordAt(s)
    const x = side * s - hinge.x
    const y = te.y - hinge.y
    const z = te.z - hinge.z
    const t = thickness * (1 - 0.15 * (i / steps))
    rings.push([
      new THREE.Vector3(x, y + t / 2, z),
      new THREE.Vector3(x, y + t * 0.12, z - c),
      new THREE.Vector3(x, y - t * 0.12, z - c),
      new THREE.Vector3(x, y - t / 2, z),
    ])
  }
  const geo = tileUv(loft(rings), 0.9, 'xz')
  const axis = new THREE.Vector3(side, 0, 0)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), -side * 5 * DEG)
    .normalize()
  return { geo, hinge, axis }
}

/**
 * A plain tapered slab about a hinge at the origin, running out along ±X.
 * Elevators and the rudder are this shape; the rudder is simply built on its
 * side and rotated when it is placed.
 */
function slab(
  half: number,
  rootChord: number,
  tipChord: number,
  thickness: number,
  side = 1,
) {
  const rings: Ring[] = []
  const steps = 5
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const x = side * half * f
    const c = rootChord + (tipChord - rootChord) * f
    const t = thickness * (1 - 0.3 * f)
    rings.push([
      new THREE.Vector3(x, t / 2, 0),
      new THREE.Vector3(x, t * 0.1, -c),
      new THREE.Vector3(x, -t * 0.1, -c),
      new THREE.Vector3(x, -t / 2, 0),
    ])
  }
  return tileUv(loft(rings), 0.9, 'xz')
}

/** An exhaust stub: flattened where it leaves the stack, in the fishtail way. */
function exhaustStub(z: number, side: number) {
  const rings: Ring[] = []
  for (let i = 0; i <= 3; i++) {
    const f = i / 3
    const x = side * (0.42 + f * 0.13)
    const w = 0.055 - f * 0.018
    const h = 0.05 + f * 0.022
    const drop = -f * 0.035
    const back = -f * 0.05
    rings.push([
      new THREE.Vector3(x, 0.12 + h + drop, z + w + back),
      new THREE.Vector3(x, 0.12 + drop, z + w * 1.25 + back),
      new THREE.Vector3(x, 0.12 - h + drop, z + w + back),
      new THREE.Vector3(x, 0.12 - h + drop, z - w + back),
      new THREE.Vector3(x, 0.12 + drop, z - w * 1.25 + back),
      new THREE.Vector3(x, 0.12 + h + drop, z - w + back),
    ])
  }
  return loft(rings, { capEnd: false })
}

function Hinged({
  hinge,
  axis,
  angle,
  geometry,
  map,
}: {
  hinge: THREE.Vector3
  axis: THREE.Vector3
  angle: number
  geometry: THREE.BufferGeometry
  map: THREE.Texture
}) {
  const group = useRef<THREE.Group>(null)
  const q = useRef(new THREE.Quaternion())
  useFrame((_, dt) => {
    if (!group.current) return
    q.current.setFromAxisAngle(axis, angle)
    group.current.quaternion.slerp(q.current, 1 - Math.exp(-10 * dt))
  })
  return (
    <group ref={group} position={hinge}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <Skin map={map} />
      </mesh>
    </group>
  )
}

/**
 * The paint is drawn to a canvas, which means it must be built in the
 * browser and it costs a few milliseconds. Both the exhibit and the
 * simulator mount the same aeroplane, so they share one set.
 */
let paintShop: { fuselage: THREE.Texture; wing: THREE.Texture; panel: THREE.Texture } | null = null
function livery() {
  paintShop ??= {
    fuselage: fuselageTexture(),
    wing: wingTexture(),
    panel: panelTexture(),
  }
  return paintShop
}

export function P51({
  controls,
  mount = 'plinth',
}: {
  controls: Controls
  mount?: Mount
}) {
  const throttle = (controls.throttle ?? 0) / 100
  const gearDown = (controls.gear ?? 1) > 0.5
  const flapAngle = (controls.flaps ?? 0) * DEG
  const canopyOpen = (controls.canopy ?? 0) > 0.5
  const elevator = (controls.elevator ?? 0) * DEG
  const rudder = (controls.rudder ?? 0) * DEG
  const roll = (controls.roll ?? 0) * DEG
  const radiator = (controls.radiator ?? 6) * DEG
  const firing = (controls.guns ?? 0) > 0.5

  const paint = useMemo(() => livery(), [])

  // --- Geometry, built once -------------------------------------------------
  const geo = useMemo(() => {
    const fuselage = wrapFuselage(loftSuper(FUSELAGE, 30))

    // One continuous wing, port tip through to starboard tip.
    const full: WingStation[] = [
      ...PANEL.slice(1).reverse().map((st) => ({ ...st, span: -st.span })),
      ...PANEL,
    ]
    const wing = wrapWing(liftingSurface(full), atSpan)

    const tailPanel: WingStation[] = [
      { span: 0, chord: 1.42, lead: -3.3, rise: 0.02, thickness: 0.1 },
      { span: 1.1, chord: 1.2, lead: -3.24, rise: 0.05, thickness: 0.095 },
      { span: 1.8, chord: 0.98, lead: -3.18, rise: 0.07, thickness: 0.09 },
      { span: 2.02, chord: 0.78, lead: -3.16, rise: 0.08, thickness: 0.085 },
    ]
    const tail = tileUv(
      liftingSurface([
        ...tailPanel.slice(1).reverse().map((st) => ({ ...st, span: -st.span })),
        ...tailPanel,
      ]),
      0.9,
      'xz',
    )

    // Fin: lofted up the Y axis instead of out the span.
    const fin = tileUv(
      liftingSurface(
        [
          { span: 0.1, chord: 2.15, lead: -2.65, rise: 0, thickness: 0.11 },
          { span: 0.7, chord: 1.9, lead: -2.72, rise: 0, thickness: 0.1 },
          { span: 1.2, chord: 1.55, lead: -2.85, rise: 0, thickness: 0.09 },
          { span: 1.5, chord: 1.15, lead: -3.05, rise: 0, thickness: 0.08 },
        ],
        { vertical: true },
      ),
      0.9,
      'yz',
    )

    // Dorsal fin fillet — the cure for the bubble canopy's lost side area.
    // A thin lofted web running forward from the fin root along the decking.
    const dorsal = tileUv(
      loftSuper(
        [
          { z: -1.05, y: 0.3, halfWidth: 0.018, top: 0.012, bottom: 0.07, power: 2.2 },
          { z: -1.7, y: 0.32, halfWidth: 0.03, top: 0.055, bottom: 0.09, power: 2.2 },
          { z: -2.2, y: 0.35, halfWidth: 0.04, top: 0.13, bottom: 0.1, power: 2.2 },
          { z: -2.62, y: 0.4, halfWidth: 0.045, top: 0.22, bottom: 0.12, power: 2.2 },
          { z: -2.95, y: 0.44, halfWidth: 0.045, top: 0.3, bottom: 0.14, power: 2.2 },
        ],
        18,
      ),
      0.9,
      'yz',
    )

    // Wing root fairing: the fillet that keeps the junction from separating.
    // Built as a slender body in the corner and copied to both sides.
    const filletHalf = loftSuper(
      [
        { z: 2.1, y: -0.12, halfWidth: 0.015, top: 0.015, bottom: 0.015, power: 2.6 },
        { z: 1.5, y: -0.12, halfWidth: 0.1, top: 0.1, bottom: 0.13, power: 2.6 },
        { z: 0.6, y: -0.12, halfWidth: 0.17, top: 0.16, bottom: 0.21, power: 2.6 },
        { z: -0.4, y: -0.12, halfWidth: 0.2, top: 0.17, bottom: 0.23, power: 2.6 },
        { z: -1.25, y: -0.11, halfWidth: 0.17, top: 0.15, bottom: 0.17, power: 2.6 },
        { z: -2.0, y: -0.09, halfWidth: 0.1, top: 0.1, bottom: 0.1, power: 2.6 },
        { z: -2.6, y: -0.07, halfWidth: 0.015, top: 0.015, bottom: 0.015, power: 2.6 },
      ],
      20,
    )
    const fillet = tileUv(
      merge([
        filletHalf.clone().translate(0.46, 0, 0),
        filletHalf.clone().translate(-0.46, 0, 0),
      ]),
      0.9,
      'xz',
    )

    // Ventral radiator duct: the Meredith-effect scoop under the spar. The
    // inlet stands off the skin so the fuselage boundary layer misses it
    // entirely, which is the whole reason the lip is separate metal.
    const scoop = tileUv(
      loftSuper(
        [
          { z: 1.12, y: -0.6, halfWidth: 0.26, top: 0.07, bottom: 0.1, power: 3 },
          { z: 0.85, y: -0.66, halfWidth: 0.34, top: 0.12, bottom: 0.19, power: 3.1 },
          { z: 0.3, y: -0.73, halfWidth: 0.41, top: 0.15, bottom: 0.27, power: 3.2 },
          { z: -0.6, y: -0.76, halfWidth: 0.42, top: 0.16, bottom: 0.3, power: 3.2 },
          { z: -1.7, y: -0.72, halfWidth: 0.4, top: 0.14, bottom: 0.26, power: 3 },
          { z: -2.35, y: -0.64, halfWidth: 0.3, top: 0.1, bottom: 0.14, power: 2.8 },
        ],
        24,
      ),
      0.9,
      'xz',
    )
    // The inlet lip itself: a short open collar standing proud of the duct.
    const lip = loftSuper(
      [
        { z: 1.02, y: -0.72, halfWidth: 0.35, top: 0.145, bottom: 0.2, power: 3.1 },
        { z: 0.86, y: -0.72, halfWidth: 0.37, top: 0.155, bottom: 0.21, power: 3.1 },
      ],
      24,
      { capStart: false, capEnd: false },
    )

    // Carburettor air intake, under the nose, drawing from below the spinner.
    const carb = tileUv(
      loftSuper(
        [
          { z: 4.16, y: -0.3, halfWidth: 0.14, top: 0.04, bottom: 0.07, power: 3 },
          { z: 3.7, y: -0.34, halfWidth: 0.18, top: 0.05, bottom: 0.1, power: 3 },
          { z: 2.9, y: -0.36, halfWidth: 0.19, top: 0.05, bottom: 0.11, power: 3 },
          { z: 2.25, y: -0.34, halfWidth: 0.14, top: 0.04, bottom: 0.07, power: 3 },
        ],
        18,
      ),
      1.2,
      'xz',
    )

    // Canopy: fixed windscreen, then the blown hood that slides aft.
    const windscreen = loftSuper(
      [
        { z: 1.45, y: 0.4, halfWidth: 0.2, top: 0.05, bottom: 0.16, power: 2.4 },
        { z: 1.15, y: 0.42, halfWidth: 0.3, top: 0.19, bottom: 0.16, power: 2.4 },
        { z: 0.95, y: 0.42, halfWidth: 0.34, top: 0.24, bottom: 0.16, power: 2.5 },
      ],
      20,
      { capStart: false, capEnd: false },
    )
    const hood = loftSuper(
      [
        { z: 0.92, y: 0.42, halfWidth: 0.34, top: 0.25, bottom: 0.16, power: 2.5 },
        { z: 0.45, y: 0.42, halfWidth: 0.37, top: 0.31, bottom: 0.16, power: 2.6 },
        { z: -0.1, y: 0.42, halfWidth: 0.36, top: 0.3, bottom: 0.16, power: 2.6 },
        { z: -0.55, y: 0.4, halfWidth: 0.3, top: 0.22, bottom: 0.14, power: 2.5 },
        { z: -0.78, y: 0.38, halfWidth: 0.18, top: 0.11, bottom: 0.12, power: 2.4 },
      ],
      20,
      { capStart: false, capEnd: false },
    )
    // The windscreen frame: two uprights and the arch over the armour glass.
    const frame = merge([
      strut([0.2, 0.44, 1.46], [0.33, 0.45, 0.96], 0.022, 6),
      strut([-0.2, 0.44, 1.46], [-0.33, 0.45, 0.96], 0.022, 6),
      strut([0.2, 0.44, 1.46], [0, 0.56, 1.42], 0.02, 6),
      strut([-0.2, 0.44, 1.46], [0, 0.56, 1.42], 0.02, 6),
      strut([0, 0.56, 1.42], [0.33, 0.66, 0.96], 0.02, 6),
      strut([0, 0.56, 1.42], [-0.33, 0.66, 0.96], 0.02, 6),
      strut([0.33, 0.45, 0.96], [0.33, 0.66, 0.96], 0.022, 6),
      strut([-0.33, 0.45, 0.96], [-0.33, 0.66, 0.96], 0.022, 6),
    ])
    // The hood's own base rail, which is what it slides on.
    const rail = merge([
      strut([0.345, 0.42, 0.93], [0.31, 0.4, -0.72], 0.017, 5),
      strut([-0.345, 0.42, 0.93], [-0.31, 0.4, -0.72], 0.017, 5),
    ])

    // Propeller blade: a twisted, tapered paddle, with the broad cuff at the
    // root that a Hamilton Standard 24D50 carries to help cool the engine.
    const bladeRings: Ring[] = []
    for (let i = 0; i <= 10; i++) {
      const f = i / 10
      const r = 0.2 + f * 1.5
      const paddle = 0.1 + Math.sin(Math.min(1, f * 1.35) * Math.PI) * 0.24
      const cuff = f < 0.24 ? 0.3 * (1 - f / 0.24) : 0
      const chord = Math.max(paddle, cuff)
      const twist = (46 - f * 38) * DEG
      const t = (f < 0.24 ? 0.09 : 0.055) * (1 - f * 0.6)
      const ring: Ring = []
      for (const [u, v] of [
        [0.5, 0.45],
        [0.1, 0.5],
        [-0.5, 0.3],
        [-0.5, -0.3],
        [0.1, -0.5],
        [0.5, -0.45],
      ]) {
        const cz = u * chord
        const cy = v * t
        ring.push(
          new THREE.Vector3(
            r,
            cy * Math.cos(twist) - cz * Math.sin(twist),
            cy * Math.sin(twist) + cz * Math.cos(twist),
          ),
        )
      }
      bladeRings.push(ring)
    }
    const blade = loft(bladeRings)

    const spinner = loftSuper(
      [
        { z: 4.58, y: 0, halfWidth: 0.015, top: 0.015, bottom: 0.015, power: 2 },
        { z: 4.45, y: 0, halfWidth: 0.12, top: 0.12, bottom: 0.12, power: 2 },
        { z: 4.25, y: 0, halfWidth: 0.2, top: 0.2, bottom: 0.2, power: 2 },
        { z: 4.05, y: 0, halfWidth: 0.25, top: 0.25, bottom: 0.25, power: 2 },
        { z: 3.95, y: 0, halfWidth: 0.26, top: 0.26, bottom: 0.26, power: 2 },
      ],
      22,
    )

    const flapR = controlSlab(0.72, 2.95, (s) => 0.58 - (s - 0.72) * 0.035, 1)
    const flapL = controlSlab(0.72, 2.95, (s) => 0.58 - (s - 0.72) * 0.035, -1)
    const ailR = controlSlab(3.12, 5.3, (s) => 0.48 - (s - 3.12) * 0.045, 1)
    const ailL = controlSlab(3.12, 5.3, (s) => 0.48 - (s - 3.12) * 0.045, -1)

    const elevatorR = slab(1.88, 0.55, 0.38, 0.06, 1)
    const elevatorL = slab(1.88, 0.55, 0.38, 0.06, -1)
    // The rudder is built flat and stood on edge when it is placed.
    const rudderGeo = slab(1.45, 0.62, 0.42, 0.06, 1)

    const exhaustR = merge([0, 1, 2, 3, 4, 5].map((i) => exhaustStub(3.94 - i * 0.2, 1)))
    const exhaustL = merge([0, 1, 2, 3, 4, 5].map((i) => exhaustStub(3.94 - i * 0.2, -1)))

    // The aerial wire, mast head to fin top. Thin, but it catches the sun.
    const aerial = merge([
      strut([0, 0.66, -1.24], [0, 1.52, -3.32], 0.008, 4),
      strut([0, 0.66, -1.24], [0, 0.5, -0.9], 0.006, 4),
    ])

    return {
      fuselage,
      wing,
      fillet,
      tail,
      fin,
      dorsal,
      scoop,
      lip,
      carb,
      windscreen,
      hood,
      frame,
      rail,
      blade,
      spinner,
      flapR,
      flapL,
      ailR,
      ailL,
      elevatorR,
      elevatorL,
      rudderGeo,
      exhaustR,
      exhaustL,
      aerial,
    }
  }, [])

  // --- Animation ------------------------------------------------------------
  const prop = useRef<THREE.Group>(null)
  const disc = useRef<THREE.Mesh>(null)
  const stance = useRef<THREE.Group>(null)
  const gearRef = useRef<THREE.Group[]>([])
  const tailGear = useRef<THREE.Group>(null)
  const tailDoors = useRef<THREE.Group[]>([])
  const hoodRef = useRef<THREE.Group>(null)
  const exitFlap = useRef<THREE.Group>(null)
  const flashes = useRef<THREE.Mesh[]>([])

  // Ground attitude: both main wheels and the tailwheel on the floor at once.
  const GROUND_PITCH = P51_STANCE.pitch
  const GROUND_RISE = P51_STANCE.rise

  useFrame((state, dt) => {
    const k = 1 - Math.exp(-6 * dt)

    if (prop.current && throttle > 0.001) {
      // Idle 1,200 to 3,000 crankshaft rpm, through the 0.479:1 reduction gear.
      const propRpm = (1200 + throttle * 1800) * 0.479
      prop.current.rotation.z -= (propRpm * 2 * Math.PI * dt) / 60
    }
    if (disc.current) {
      const m = disc.current.material as THREE.MeshBasicMaterial
      m.opacity += (Math.max(0, throttle - 0.15) * 0.22 - m.opacity) * k
      disc.current.visible = m.opacity > 0.005
    }
    // Under a simulator the airframe keeps its own axes; whoever is flying it
    // decides where it sits.
    if (stance.current && mount === 'plinth') {
      const targetPitch = gearDown ? -GROUND_PITCH : 0
      const targetY = gearDown ? GROUND_RISE : 2.55
      stance.current.rotation.x += (targetPitch - stance.current.rotation.x) * k
      stance.current.position.y += (targetY - stance.current.position.y) * k
    }
    for (const g of gearRef.current) {
      if (!g) continue
      const target = gearDown ? 0 : 88 * DEG
      g.rotation.z += (target * (g.userData.side as number) - g.rotation.z) * k
    }
    if (tailGear.current) {
      const target = gearDown ? 0 : -95 * DEG
      tailGear.current.rotation.x += (target - tailGear.current.rotation.x) * k
    }
    for (const d of tailDoors.current) {
      if (!d) continue
      // The tailwheel doors are mechanically linked to the leg: open with it,
      // shut behind it, which is why they are never seen half way.
      const target = gearDown ? 92 * DEG * (d.userData.side as number) : 0
      d.rotation.z += (target - d.rotation.z) * k
    }
    if (hoodRef.current) {
      const target = canopyOpen ? -0.62 : 0
      hoodRef.current.position.z += (target - hoodRef.current.position.z) * k
    }
    if (exitFlap.current) {
      exitFlap.current.rotation.x += (radiator - exitFlap.current.rotation.x) * k
    }
    // Muzzle flash: a fifth of a second of light at the front of the blast
    // tube, flickering because six guns do not fire in step.
    const t = state.clock.elapsedTime
    for (let i = 0; i < flashes.current.length; i++) {
      const f = flashes.current[i]
      if (!f) continue
      f.visible = firing
      if (!firing) continue
      const flicker = 0.55 + 0.45 * Math.sin(t * 190 + i * 2.3)
      f.scale.set(flicker, flicker, 1.1 + flicker * 1.3)
    }
  })

  // Muzzles are staggered in the leading edge: the inboard gun sits furthest
  // forward, and each one outboard of it is set back a little.
  const gunStations = [
    { x: 1.25, out: 0.3 },
    { x: 1.72, out: 0.18 },
    { x: 2.19, out: 0.06 },
  ]

  return (
    <group
      ref={stance}
      position={mount === 'free' ? [0, 0, 0] : [0, GROUND_RISE, 0]}
      rotation={mount === 'free' ? [0, 0, 0] : [-GROUND_PITCH, 0, 0]}
    >
      {/* ---------------------------------------------------------------- */}
      <Part id="fuselage">
        <mesh geometry={geo.fuselage} castShadow receiveShadow>
          <Skin map={paint.fuselage} metalness={0.78} roughness={0.34} />
        </mesh>
        <mesh geometry={geo.fillet} castShadow receiveShadow>
          <Skin map={paint.panel} />
        </mesh>
        {/* Filler caps and the step the pilot puts a boot through. */}
        <mesh position={[0.3, 0.42, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.012, 12]} />
          <Mat {...STEEL} />
        </mesh>
        <mesh position={[-0.42, -0.18, -0.45]}>
          <boxGeometry args={[0.06, 0.1, 0.16]} />
          <Mat {...DARK} />
        </mesh>
      </Part>

      <Part id="cockpit">
        {/* Floor, seat pan and back, armour behind the pilot's shoulders. */}
        <mesh position={[0, 0.02, -0.05]}>
          <boxGeometry args={[0.56, 0.05, 1.0]} />
          <Mat {...INTERIOR} />
        </mesh>
        <mesh position={[0, 0.16, -0.22]}>
          <boxGeometry args={[0.44, 0.07, 0.42]} />
          <Mat {...LEATHER} />
        </mesh>
        <mesh position={[0, 0.42, -0.44]} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[0.42, 0.52, 0.06]} />
          <Mat {...LEATHER} />
        </mesh>
        {/* 5/16 in face-hardened plate, and the headrest in front of it. */}
        <mesh position={[0, 0.5, -0.56]}>
          <boxGeometry args={[0.5, 0.66, 0.008]} />
          <Mat color="#4b4e54" metalness={0.9} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.72, -0.5]}>
          <boxGeometry args={[0.24, 0.16, 0.08]} />
          <Mat {...LEATHER} />
        </mesh>
        {/* Instrument panel, coaming, stick and pedals. */}
        <mesh position={[0, 0.36, 0.44]} rotation={[-0.12, 0, 0]}>
          <boxGeometry args={[0.5, 0.42, 0.04]} />
          <Mat color="#26282c" metalness={0.3} roughness={0.85} />
        </mesh>
        {[-0.16, 0, 0.16].map((x) => (
          <mesh key={x} position={[x, 0.42, 0.42]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.02, 12]} />
            <Mat color="#14161a" metalness={0.2} roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 0.56, 0.5]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[0.52, 0.06, 0.18]} />
          <Mat {...DARK} />
        </mesh>
        <mesh position={[0, 0.2, 0.12]} rotation={[-0.06, 0, 0]}>
          <cylinderGeometry args={[0.016, 0.022, 0.4, 8]} />
          <Mat {...STEEL} />
        </mesh>
        <mesh position={[0, 0.41, 0.1]}>
          <boxGeometry args={[0.07, 0.1, 0.05]} />
          <Mat {...DARK} />
        </mesh>
        {[0.12, -0.12].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.62]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.09, 0.03, 0.14]} />
            <Mat {...STEEL} />
          </mesh>
        ))}
        {/* Throttle quadrant, on the left-hand side rail where it belongs. */}
        <mesh position={[-0.27, 0.26, 0.24]}>
          <boxGeometry args={[0.07, 0.1, 0.24]} />
          <Mat {...DARK} />
        </mesh>
      </Part>

      <Part id="gunsight">
        {/* K-14A: the computing head, the reflector glass, and the sun filter
            stowed to one side. The pilot set wingspan and range on it and it
            worked out the deflection for him. */}
        <mesh position={[0, 0.63, 0.74]}>
          <boxGeometry args={[0.12, 0.16, 0.2]} />
          <Mat color="#23262b" metalness={0.5} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.76, 0.74]}>
          <cylinderGeometry args={[0.035, 0.045, 0.1, 10]} />
          <Mat color="#23262b" metalness={0.5} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.74, 0.86]} rotation={[0.42, 0, 0]}>
          <boxGeometry args={[0.13, 0.13, 0.006]} />
          <Mat color="#a8d8c6" metalness={0.1} roughness={0.05} opacity={0.3} />
        </mesh>
        <mesh position={[0.1, 0.71, 0.82]} rotation={[0, 0.5, 0]}>
          <boxGeometry args={[0.09, 0.09, 0.005]} />
          <Mat color="#5a4a20" metalness={0.2} roughness={0.4} opacity={0.5} />
        </mesh>
      </Part>

      <Part id="canopy">
        {/* Flat laminated armour glass ahead of the pilot's face: the one
            panel on the aeroplane you could stop a bullet with. */}
        <mesh position={[0, 0.55, 1.42]} rotation={[0.46, 0, 0]}>
          <boxGeometry args={[0.36, 0.3, 0.038]} />
          <Mat color="#b7d9de" metalness={0.1} roughness={0.06} opacity={0.42} />
        </mesh>
        <mesh geometry={geo.windscreen}>
          <Mat color="#9fd4de" metalness={0.1} roughness={0.05} opacity={0.34} />
        </mesh>
        <mesh geometry={geo.frame} castShadow>
          <Mat {...OLIVE} />
        </mesh>
        <mesh geometry={geo.rail}>
          <Mat {...ALUMINIUM} />
        </mesh>
        <group ref={hoodRef}>
          <mesh geometry={geo.hood}>
            <Mat color="#9fd4de" metalness={0.1} roughness={0.05} opacity={0.3} />
          </mesh>
          {/* The hood's own frame, and the crank handle inside it. */}
          <mesh position={[0, 0.42, 0.92]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.33, 0.014, 6, 20, Math.PI]} />
            <Mat {...OLIVE} />
          </mesh>
          <mesh position={[0, 0.4, -0.76]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.012, 6, 16, Math.PI]} />
            <Mat {...OLIVE} />
          </mesh>
        </group>
      </Part>

      {/* ---------------------------------------------------------------- */}
      <Part id="wing">
        <mesh geometry={geo.wing} castShadow receiveShadow>
          <Skin map={paint.wing} metalness={0.55} roughness={0.45} />
        </mesh>
        {/* Navigation lights: red to port, green to starboard, as rigged. */}
        <mesh position={[5.6, 0.29, 1.0]}>
          <sphereGeometry args={[0.055, 10, 8]} />
          <meshBasicMaterial color="#39d06a" toneMapped={false} />
        </mesh>
        <mesh position={[-5.6, 0.29, 1.0]}>
          <sphereGeometry args={[0.055, 10, 8]} />
          <meshBasicMaterial color="#e2483c" toneMapped={false} />
        </mesh>
        {/* Landing light, recessed in the port leading edge. */}
        <mesh position={[-3.0, 0.06, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.02, 14]} />
          <Mat color="#cfd6de" metalness={0.9} roughness={0.15} />
        </mesh>
      </Part>

      <Part id="flaps">
        <Hinged
          hinge={geo.flapR.hinge}
          axis={geo.flapR.axis}
          geometry={geo.flapR.geo}
          angle={flapAngle}
          map={paint.panel}
        />
      </Part>
      <Part id="flaps" mirror>
        <Hinged
          hinge={geo.flapL.hinge}
          axis={geo.flapL.axis}
          geometry={geo.flapL.geo}
          angle={flapAngle}
          map={paint.panel}
        />
      </Part>

      {/* Ailerons move in opposition: one up, one down. */}
      <Part id="ailerons">
        <Hinged
          hinge={geo.ailR.hinge}
          axis={geo.ailR.axis}
          geometry={geo.ailR.geo}
          angle={-roll}
          map={paint.panel}
        />
      </Part>
      <Part id="ailerons" mirror>
        <Hinged
          hinge={geo.ailL.hinge}
          axis={geo.ailL.axis}
          geometry={geo.ailL.geo}
          angle={roll}
          map={paint.panel}
        />
      </Part>

      {/* ---------------------------------------------------------------- */}
      <Part id="propeller">
        <group ref={prop} position={[0, 0, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
              <mesh geometry={geo.blade} position={[0, 0, 4.16]} castShadow>
                <Mat color="#26282c" metalness={0.7} roughness={0.42} />
              </mesh>
              {/* Yellow tip, four inches of it, so the ground crew keep their
                  heads. */}
              <mesh position={[1.62, 0, 4.16]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.055, 0.04, 0.11, 8]} />
                <Mat color="#d8a423" metalness={0.4} roughness={0.5} />
              </mesh>
              {/* Blade shank and the hub barrel it turns in. */}
              <mesh position={[0.17, 0, 4.16]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.07, 0.085, 0.3, 12]} />
                <Mat {...STEEL} />
              </mesh>
            </group>
          ))}
          <mesh geometry={geo.spinner} castShadow>
            <Mat color="#b23a32" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 3.96]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.03, 24]} />
            <Mat {...STEEL} />
          </mesh>
        </group>
        {/* The disc the eye actually sees once it spins up. */}
        <mesh ref={disc} position={[0, 0, 4.2]} visible={false}>
          <circleGeometry args={[1.7, 48]} />
          <meshBasicMaterial
            color="#cdd3dc"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </Part>

      <Part id="engine">
        {/* Block and banks, sitting where the cowl covers it. */}
        <mesh position={[0, 0.02, 3.35]}>
          <boxGeometry args={[0.52, 0.42, 1.55]} />
          <Mat color="#3c4047" metalness={0.8} roughness={0.45} />
        </mesh>
        {[1, -1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.26, 0.2, 3.35]}
            rotation={[0, 0, side * 0.52]}
          >
            <boxGeometry args={[0.3, 0.26, 1.5]} />
            <Mat color="#4a4f57" metalness={0.85} roughness={0.4} />
          </mesh>
        ))}
        {/* Reduction gear housing and prop shaft. */}
        <mesh position={[0, 0.06, 4.18]}>
          <cylinderGeometry args={[0.2, 0.26, 0.5, 16]} />
          <Mat {...STEEL} />
        </mesh>
        <mesh position={[0, 0, 2.35]}>
          <boxGeometry args={[0.46, 0.5, 0.5]} />
          <Mat color="#33363c" metalness={0.75} roughness={0.5} />
        </mesh>
        {/* Two-stage supercharger, behind the block and under the cockpit. */}
        <mesh position={[0, -0.1, 2.0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.3, 16]} />
          <Mat color="#41454c" metalness={0.85} roughness={0.4} />
        </mesh>
      </Part>

      <Part id="exhaust">
        <mesh geometry={geo.exhaustR} castShadow>
          <Mat {...SOOT} />
        </mesh>
      </Part>
      <Part id="exhaust" mirror>
        <mesh geometry={geo.exhaustL} castShadow>
          <Mat {...SOOT} />
        </mesh>
      </Part>

      <Part id="carb-scoop">
        <mesh geometry={geo.carb} castShadow receiveShadow>
          <Skin map={paint.panel} />
        </mesh>
        {/* The inlet face: a dark hole, which is what an intake reads as. */}
        <mesh position={[0, -0.3, 4.15]}>
          <boxGeometry args={[0.24, 0.1, 0.02]} />
          <Mat color="#141619" metalness={0.2} roughness={0.95} />
        </mesh>
      </Part>

      {/* ---------------------------------------------------------------- */}
      <Part id="radiator">
        <mesh geometry={geo.scoop} castShadow receiveShadow>
          <Skin map={paint.panel} />
        </mesh>
        <mesh geometry={geo.lip} castShadow>
          <Mat {...ALUMINIUM} />
        </mesh>
        {/* Radiator face, visible in the inlet. */}
        <mesh position={[0, -0.74, 0.86]}>
          <boxGeometry args={[0.62, 0.3, 0.06]} />
          <Mat color="#1f2124" metalness={0.4} roughness={0.9} />
        </mesh>
        {/* Thermostatic exit door, hinged at its leading edge. */}
        <group ref={exitFlap} position={[0, -0.84, -1.78]}>
          <mesh position={[0, 0, -0.26]} castShadow>
            <boxGeometry args={[0.66, 0.03, 0.52]} />
            <Mat {...ALUMINIUM} />
          </mesh>
        </group>
      </Part>

      {[1, -1].map((side) => (
        <Part key={side} id="guns" mirror={side < 0}>
          {gunStations.map((g, i) => {
            const st = atSpan(g.x)
            const muzzle = st.lead + g.out
            return (
              <group key={i}>
                {/* Barrel, standing out of the leading edge. */}
                <mesh
                  position={[side * g.x, st.rise + 0.03, muzzle - 0.14]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.019, 0.023, 0.34, 10]} />
                  <Mat {...STEEL} />
                </mesh>
                {/* Blast tube in the leading edge behind it. */}
                <mesh
                  position={[side * g.x, st.rise + 0.03, muzzle - 0.42]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.036, 0.036, 0.24, 10]} />
                  <Mat {...DARK} />
                </mesh>
                {/* The gun itself and its ammunition box, inside the wing. */}
                <mesh position={[side * g.x, st.rise + 0.02, muzzle - 1.1]}>
                  <boxGeometry args={[0.11, 0.13, 1.1]} />
                  <Mat {...DARK} />
                </mesh>
                <mesh position={[side * (g.x + 0.17), st.rise, muzzle - 1.15]}>
                  <boxGeometry args={[0.2, 0.15, 0.55]} />
                  <Mat color="#3b3f45" metalness={0.6} roughness={0.6} />
                </mesh>
                {/* Muzzle flash, shown only while the trigger is down. */}
                <mesh
                  visible={false}
                  ref={(el) => {
                    if (el) flashes.current[(side > 0 ? 0 : 3) + i] = el
                  }}
                  position={[side * g.x, st.rise + 0.03, muzzle + 0.16]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <coneGeometry args={[0.075, 0.34, 8, 1, true]} />
                  <meshBasicMaterial
                    color="#ffd489"
                    transparent
                    opacity={0.75}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </group>
            )
          })}
        </Part>
      ))}

      {/* ---------------------------------------------------------------- */}
      <Part id="tailplane">
        <mesh geometry={geo.tail} castShadow receiveShadow>
          <Skin map={paint.panel} />
        </mesh>
        <group position={[0.14, 0.05, -4.15]} rotation={[elevator, 0, 0]}>
          <mesh geometry={geo.elevatorR} castShadow>
            <Skin map={paint.panel} />
          </mesh>
        </group>
        <group position={[-0.14, 0.05, -4.15]} rotation={[elevator, 0, 0]}>
          <mesh geometry={geo.elevatorL} castShadow>
            <Skin map={paint.panel} />
          </mesh>
        </group>
        {/* Elevator trim tab, on the port surface. */}
        <mesh position={[-0.9, 0.05, -4.52]} rotation={[-elevator * 0.5, 0, 0]}>
          <boxGeometry args={[0.6, 0.02, 0.14]} />
          <Mat {...ALUMINIUM} />
        </mesh>
      </Part>

      <Part id="fin">
        <mesh geometry={geo.fin} castShadow receiveShadow>
          <Skin map={paint.panel} />
        </mesh>
        <mesh geometry={geo.dorsal} castShadow>
          <Skin map={paint.panel} />
        </mesh>
        <group position={[0, 0.16, -3.95]} rotation={[0, rudder, 0]}>
          <mesh
            geometry={geo.rudderGeo}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <Skin map={paint.panel} />
          </mesh>
        </group>
        {/* Rudder trim tab, and the white tail light above it. */}
        <mesh position={[0, 0.5, -4.62]} rotation={[0, rudder * 0.6, 0]}>
          <boxGeometry args={[0.02, 0.5, 0.12]} />
          <Mat {...ALUMINIUM} />
        </mesh>
        <mesh position={[0, 1.55, -4.2]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshBasicMaterial color="#f2efe4" toneMapped={false} />
        </mesh>
      </Part>

      <Part id="aerial">
        {/* Mast behind the hood and the wire back to the fin: the VHF set is
            how the squadron talks, so it is not a detail. */}
        <mesh position={[0, 0.5, -1.2]} rotation={[-0.22, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.028, 0.34, 6]} />
          <Mat {...DARK} />
        </mesh>
        <mesh geometry={geo.aerial}>
          <Mat color="#2b2d31" metalness={0.4} roughness={0.7} />
        </mesh>
        {/* IFF whip under the starboard wing root. */}
        <mesh position={[0.7, -0.44, -0.9]} rotation={[0.25, 0, 0.2]}>
          <cylinderGeometry args={[0.006, 0.012, 0.42, 5]} />
          <Mat {...DARK} />
        </mesh>
      </Part>

      <Part id="pitot">
        {/* Pitot head on its mast, under the port wing where the airflow is
            undisturbed. Everything the airspeed indicator knows comes from
            this tube. */}
        <mesh position={[-4.62, 0.05, 0.62]}>
          <boxGeometry args={[0.03, 0.2, 0.1]} />
          <Mat {...STEEL} />
        </mesh>
        <mesh position={[-4.62, -0.06, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.42, 8]} />
          <Mat {...CHROME} />
        </mesh>
      </Part>

      {/* ---------------------------------------------------------------- */}
      {[1, -1].map((side) => {
        const x = side * 1.805
        const st = atSpan(1.805)
        return (
          <Part key={side} id="gear-main" mirror={side < 0}>
            <group
              ref={(el) => {
                if (el) {
                  el.userData.side = side
                  gearRef.current[side > 0 ? 0 : 1] = el
                }
              }}
              position={[x, st.rise - 0.18, st.lead - 0.95]}
            >
              {/* Trunnion and the fixed upper half of the leg. */}
              <mesh position={[0, -0.28, 0]}>
                <cylinderGeometry args={[0.072, 0.078, 0.56, 12]} />
                <Mat {...STEEL} />
              </mesh>
              {/* Oleo piston: polished, and the part that actually moves. */}
              <mesh position={[0, -0.74, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.42, 12]} />
                <Mat {...CHROME} />
              </mesh>
              {/* Torque scissors across the oleo, so the wheel cannot castor. */}
              <mesh position={[side * 0.075, -0.6, 0.02]} rotation={[0, 0, -side * 0.5]}>
                <boxGeometry args={[0.02, 0.24, 0.05]} />
                <Mat {...STEEL} />
              </mesh>
              <mesh position={[side * 0.075, -0.79, 0.02]} rotation={[0, 0, side * 0.5]}>
                <boxGeometry args={[0.02, 0.24, 0.05]} />
                <Mat {...STEEL} />
              </mesh>
              {/* Drag brace up into the wing. */}
              <mesh position={[0, -0.36, 0.3]} rotation={[-0.75, 0, 0]}>
                <cylinderGeometry args={[0.03, 0.034, 0.75, 8]} />
                <Mat {...STEEL} />
              </mesh>
              {/* 27-inch smooth-contour main wheel, on its brake drum. */}
              <mesh position={[0, -1.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.343, 0.343, 0.17, 24]} />
                <Mat {...RUBBER} />
              </mesh>
              <mesh position={[0, -1.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.175, 0.175, 0.2, 18]} />
                <Mat {...OLIVE} />
              </mesh>
              <mesh position={[side * 0.1, -1.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.1, 0.1, 0.03, 12]} />
                <Mat {...STEEL} />
              </mesh>
              {/* Brake line down the back of the leg. */}
              <mesh position={[0, -0.6, -0.07]} rotation={[0.05, 0, 0]}>
                <cylinderGeometry args={[0.008, 0.008, 0.7, 5]} />
                <Mat color="#20221f" metalness={0.3} roughness={0.8} />
              </mesh>
              {/* Leg door, which travels with the leg, and the small bay door
                  hinged inboard of it. */}
              <mesh position={[side * 0.115, -0.42, 0.02]}>
                <boxGeometry args={[0.03, 1.0, 0.66]} />
                <Mat {...ALUMINIUM} />
              </mesh>
              <mesh position={[side * 0.42, 0.06, 0.02]} rotation={[0, 0, -side * 0.35]}>
                <boxGeometry args={[0.6, 0.025, 0.72]} />
                <Mat {...ALUMINIUM} />
              </mesh>
            </group>
          </Part>
        )
      })}

      <Part id="gear-tail">
        <group ref={tailGear} position={[0, -0.28, -3.88]}>
          <mesh position={[0, -0.17, 0.02]} rotation={[0.2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.045, 0.35, 8]} />
            <Mat {...STEEL} />
          </mesh>
          <mesh position={[0, -0.05, 0.05]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.1, 0.16, 0.12]} />
            <Mat {...STEEL} />
          </mesh>
          <mesh position={[0, -0.34, 0.06]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.159, 0.159, 0.1, 16]} />
            <Mat {...RUBBER} />
          </mesh>
          <mesh position={[0, -0.34, 0.06]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.07, 0.07, 0.11, 10]} />
            <Mat {...OLIVE} />
          </mesh>
        </group>
        {/* Doors either side of the tailwheel bay. */}
        {[1, -1].map((side) => (
          <group
            key={side}
            ref={(el) => {
              if (el) {
                el.userData.side = side
                tailDoors.current[side > 0 ? 0 : 1] = el
              }
            }}
            position={[side * 0.06, -0.3, -3.88]}
          >
            <mesh position={[side * 0.06, 0, 0]}>
              <boxGeometry args={[0.13, 0.02, 0.56]} />
              <Mat {...ALUMINIUM} />
            </mesh>
          </group>
        ))}
      </Part>
    </group>
  )
}
