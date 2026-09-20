import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import { loft, merge, strut } from './geometry'
import type { Controls, Mount } from '../types'

/**
 * 1903 Wright Flyer.
 *
 * Model axes: +Z forward through the canard, +X out the starboard wing,
 * +Y up, metres. The lower wing sits at skid height; everything else is
 * measured off it.
 *
 * The machine is almost entirely spruce, ash, steel wire and unbleached
 * muslin, and at close range that is what it should read as: fabric that
 * scallops between the ribs because the trailing edge is a wire rather than
 * a spar, seams running on the bias because the cloth was cut diagonally so
 * it would brace the structure, and something over a hundred separate wires.
 * The wires are lofted cylinders six millimetres across and merged into one
 * buffer — a hundred draw calls of bracing would cost more than the rest of
 * the museum put together.
 */

const DEG = Math.PI / 180

const SPRUCE = { color: '#9c7a4e', metalness: 0.08, roughness: 0.82 }
const ASH = { color: '#b29a72', metalness: 0.06, roughness: 0.78 }
const MUSLIN = { color: '#c9bda4', metalness: 0.02, roughness: 0.95 }
const IRON = { color: '#4b4b50', metalness: 0.88, roughness: 0.42 }
const BRASS = { color: '#8a7442', metalness: 0.85, roughness: 0.4 }
const ALLOY = { color: '#9aa0a4', metalness: 0.72, roughness: 0.48 }

const SPAN = 12.29
const HALF = SPAN / 2
const CHORD = 1.98
const GAP = 1.88
const LOWER_Y = 0.45
const UPPER_Y = LOWER_Y + GAP
const CAMBER = 1 / 20
const LE = CHORD / 2 // leading edge at +Z
const TE = -LE

/** Rib pitch. The fabric hangs between them and the trailing edge scallops. */
const RIB = 0.44
/** Width of the muslin the brothers bought, and so the seam pitch. */
const SEAM = 0.86

/** Interplane struts, outboard from the centre section. */
const POSTS = [0.55, 1.75, 2.95, 4.15, 5.35, 6.05]
/** Where the uprights meet the spars, fore and aft. */
const FRONT = LE - 0.18
const REAR = TE + 0.3

const PROP_R = 1.295 // 8 ft 6 in across
const PROP_X = 1.45
const PROP_Y = LOWER_Y + 0.9
const PROP_Z = -1.42

/** Tips rigged low, the way the brothers flew it in a Kitty Hawk wind. */
const droop = (x: number) => -0.22 * (Math.abs(x) / HALF) ** 2

/** A narrow ridge wherever a seam falls, for the bias-sewn cloth. */
function seamRidge(u: number) {
  const f = u - Math.floor(u)
  const d = (f - 0.5) / 0.085
  return Math.exp(-d * d)
}

/**
 * A thin, deeply cambered surface — a circular-arc camber line with just
 * enough thickness for ribs and doped fabric. Nothing like a modern aerofoil.
 * `bay` is 0 on a rib and 1 midway between two, which is where the cloth
 * sags and the trailing edge pulls forward.
 */
function cambered(
  lead: number,
  trail: number,
  thickness: number,
  opts: { bay?: number; x?: number; steps?: number } = {},
) {
  const { bay = 0, x = 0, steps = 14 } = opts
  const chord = lead - trail
  const upper: [number, number][] = []
  const lower: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const z = lead - t * chord
    // Parabolic camber line, peaking a little ahead of mid-chord.
    const y = CAMBER * chord * 4 * (t * (1 - t)) * (1 + 0.25 * (0.5 - t))
    // The section thins to almost nothing at the trailing edge, which on this
    // machine is a wire with cloth wrapped round it.
    const th = thickness * (1 - 0.82 * t * t)
    const sag = 0.006 * bay * Math.sin(Math.PI * t)
    const seam = 0.0035 * seamRidge((x + t * chord) / SEAM)
    upper.push([z, y + th / 2 - sag + seam])
    lower.push([z, y - th / 2 + sag * 0.6])
  }
  return [...upper, ...lower.reverse()]
}

/** Loft a Flyer wing across the span, with scalloped cloth and anhedral. */
function wingGeometry(y0: number) {
  const n = 84
  const rings: THREE.Vector3[][] = []
  for (let i = 0; i <= n; i++) {
    const x = -HALF + (SPAN * i) / n
    // Ease the trailing edge forward over the last half-metre so the tip is
    // not a cliff; the leading spar runs dead straight, because it did.
    const edge = Math.max(0, (Math.abs(x) - (HALF - 0.45)) / 0.45)
    const bay = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / RIB)
    const trail = TE + CHORD * 0.42 * edge * edge + 0.055 * bay
    const y = y0 + droop(x)
    const section = cambered(LE, trail, 0.045, { bay, x })
    rings.push(section.map(([z, dy]) => new THREE.Vector3(x, y + dy, z)))
  }
  return loft(rings)
}

/** The ash ribs, showing under the cloth at the wing root and the tips. */
function ribGeometry(y0: number) {
  const out: THREE.BufferGeometry[] = []
  for (let x = -HALF + 0.22; x < HALF; x += RIB) {
    const y = y0 + droop(x)
    const rise = CAMBER * CHORD * 0.9
    out.push(
      strut([x, y, LE - 0.02], [x, y + rise, 0.1], 0.013, 4),
      strut([x, y + rise, 0.1], [x, y - 0.005, TE + 0.06], 0.012, 4),
    )
  }
  return merge(out)
}

export function Flyer({
  controls,
  mount = 'plinth',
}: {
  controls: Controls
  mount?: Mount
}) {
  const power = (controls.engine ?? 0) / 100
  const cradle = (controls.cradle ?? 0) / 100
  const elevator = (controls.elevator ?? 0) * DEG
  const airborne = (controls.airborne ?? 0) > 0.5
  const airspeed = controls.airspeed ?? 0

  const geo = useMemo(() => {
    const upper = wingGeometry(UPPER_Y)
    const lower = wingGeometry(LOWER_Y)

    // Keep a pristine copy of every vertex: warping writes into the live
    // attribute each frame and needs somewhere to warp *from*.
    const rest = {
      upper: (upper.getAttribute('position').array as Float32Array).slice(),
      lower: (lower.getAttribute('position').array as Float32Array).slice(),
    }

    // --- Struts, ribs and wire bracing -------------------------------------
    const columns: number[] = []
    for (const p of POSTS) columns.push(p, -p)
    columns.sort((a, b) => a - b)

    const bars: THREE.BufferGeometry[] = []
    const wires: THREE.BufferGeometry[] = []
    const fittings: THREE.BufferGeometry[] = []

    for (const x of columns) {
      const yl = LOWER_Y + droop(x)
      const yu = UPPER_Y + droop(x)
      // Front and rear upright of each bay, and the socket fittings that
      // hold them: the struts are not bolted, they sit in tin sockets.
      bars.push(strut([x, yl, FRONT], [x, yu, FRONT], 0.028, 8))
      bars.push(strut([x, yl, REAR], [x, yu, REAR], 0.026, 8))
      for (const z of [FRONT, REAR]) {
        fittings.push(strut([x, yl - 0.01, z], [x, yl + 0.07, z], 0.036, 8))
        fittings.push(strut([x, yu - 0.07, z], [x, yu + 0.01, z], 0.034, 8))
      }
      // Chordwise bracing inside the bay, fore to aft.
      wires.push(strut([x, yl, FRONT], [x, yu, REAR], 0.005, 4))
      wires.push(strut([x, yu, FRONT], [x, yl, REAR], 0.005, 4))
    }

    for (let i = 0; i < columns.length - 1; i++) {
      const a = columns[i]
      const b = columns[i + 1]
      // Skip the centre bay: the engine and the pilot live there.
      if (a < 0 && b > 0) continue
      const ya = { l: LOWER_Y + droop(a), u: UPPER_Y + droop(a) }
      const yb = { l: LOWER_Y + droop(b), u: UPPER_Y + droop(b) }
      for (const z of [FRONT, REAR]) {
        wires.push(strut([a, ya.l, z], [b, yb.u, z], 0.006, 4))
        wires.push(strut([a, ya.u, z], [b, yb.l, z], 0.006, 4))
      }
      // Drift wires in the plane of each wing, holding the bay square.
      for (const y of [ya.l, ya.u]) {
        const other = y === ya.l ? yb.l : yb.u
        wires.push(strut([a, y, FRONT], [b, other, REAR], 0.0045, 4))
        wires.push(strut([a, y, REAR], [b, other, FRONT], 0.0045, 4))
      }
    }

    // The trailing edge itself: a wire, which is why the cloth scallops.
    for (const y0 of [LOWER_Y, UPPER_Y]) {
      let prev: [number, number, number] | null = null
      for (let i = 0; i <= 24; i++) {
        const x = -HALF + (SPAN * i) / 24
        const p: [number, number, number] = [x, y0 + droop(x) + 0.004, TE + 0.03]
        if (prev) wires.push(strut(prev, p, 0.004, 4))
        prev = p
      }
    }

    // --- Forward elevator outriggers ---------------------------------------
    const outriggers: THREE.BufferGeometry[] = []
    const lowBoom = LOWER_Y + 0.28
    const highBoom = LOWER_Y + 0.92
    for (const x of [0.62, -0.62]) {
      outriggers.push(strut([x, LOWER_Y + 0.02, LE - 0.1], [x, lowBoom, 3.0], 0.03, 8))
      outriggers.push(strut([x, UPPER_Y - 0.02, LE - 0.1], [x, highBoom, 3.0], 0.03, 8))
      // Vertical posts dividing the frame, and its own diagonal wires.
      for (const z of [1.28, 2.14, 3.0]) {
        const f = (z - LE) / (3.0 - LE)
        const yl = LOWER_Y + 0.02 + (lowBoom - LOWER_Y - 0.02) * f
        const yu = UPPER_Y - 0.02 + (highBoom - UPPER_Y + 0.02) * f
        outriggers.push(strut([x, yl, z], [x, yu, z], 0.024, 6))
      }
      wires.push(strut([x, LOWER_Y + 0.1, 1.28], [x, highBoom, 3.0], 0.0045, 4))
      wires.push(strut([x, UPPER_Y - 0.4, 1.28], [x, lowBoom, 3.0], 0.0045, 4))
    }
    // Cross-members tying the two outrigger frames together.
    for (const z of [2.14, 3.0]) {
      const f = (z - LE) / (3.0 - LE)
      outriggers.push(
        strut(
          [-0.62, LOWER_Y + 0.02 + (lowBoom - LOWER_Y - 0.02) * f, z],
          [0.62, LOWER_Y + 0.02 + (lowBoom - LOWER_Y - 0.02) * f, z],
          0.022,
          6,
        ),
      )
    }

    // --- Rear rudder outriggers --------------------------------------------
    const tailBooms: THREE.BufferGeometry[] = []
    for (const x of [0.42, -0.42]) {
      tailBooms.push(strut([x, LOWER_Y + 0.05, REAR - 0.1], [x, LOWER_Y + 0.55, -3.1], 0.028, 8))
      tailBooms.push(strut([x, UPPER_Y - 0.05, REAR - 0.1], [x, LOWER_Y + 1.35, -3.1], 0.028, 8))
      tailBooms.push(strut([x, LOWER_Y + 0.55, -3.1], [x, LOWER_Y + 1.35, -3.1], 0.024, 6))
      tailBooms.push(strut([x, LOWER_Y + 0.3, -1.8], [x, LOWER_Y + 1.15, -1.8], 0.022, 6))
      wires.push(strut([x, LOWER_Y + 0.15, REAR], [x, LOWER_Y + 1.35, -3.1], 0.0045, 4))
      wires.push(strut([x, UPPER_Y - 0.15, REAR], [x, LOWER_Y + 0.55, -3.1], 0.0045, 4))
    }
    tailBooms.push(strut([-0.42, LOWER_Y + 0.55, -3.1], [0.42, LOWER_Y + 0.55, -3.1], 0.022, 6))
    tailBooms.push(strut([-0.42, LOWER_Y + 1.35, -3.1], [0.42, LOWER_Y + 1.35, -3.1], 0.022, 6))

    // --- Skids ---------------------------------------------------------------
    const skids: THREE.BufferGeometry[] = []
    for (const x of [0.6, -0.6]) {
      // Steam-bent ash: flat along the sand, then swept up at the front to
      // meet the elevator frame, so a nose-down arrival rides rather than digs.
      const path: [number, number][] = [
        [-2.6, 0.02],
        [-1.0, 0.0],
        [1.2, 0.0],
        [2.6, 0.06],
        [3.2, 0.26],
        [3.62, 0.62],
        [3.78, 1.02],
      ]
      for (let i = 0; i < path.length - 1; i++) {
        skids.push(
          strut([x, path[i][1], path[i][0]], [x, path[i + 1][1], path[i + 1][0]], 0.045, 8),
        )
      }
      // Posts carrying the lower wing above the skids.
      for (const z of [FRONT, REAR]) {
        skids.push(strut([x, 0.0, z], [x, LOWER_Y + droop(x), z], 0.03, 8))
      }
    }
    // Cross-pieces between the skids, and the wires that keep them square.
    for (const z of [-2.2, 0.1, 2.4]) {
      skids.push(strut([-0.6, z > 2 ? 0.04 : 0.0, z], [0.6, z > 2 ? 0.04 : 0.0, z], 0.032, 6))
    }
    wires.push(strut([-0.6, 0.0, -2.2], [0.6, 0.0, 0.1], 0.005, 4))
    wires.push(strut([0.6, 0.0, -2.2], [-0.6, 0.0, 0.1], 0.005, 4))

    // --- Control runs --------------------------------------------------------
    // The wires that make the patent work: out to each wingtip from the
    // cradle, and back to the rudder from the same place.
    const cradleAt: [number, number, number] = [-0.34, LOWER_Y + 0.14, 0.22]
    for (const s of [1, -1]) {
      wires.push(strut(cradleAt, [s * 5.9, UPPER_Y + droop(5.9) - 0.05, REAR], 0.005, 4))
      wires.push(strut(cradleAt, [s * 5.9, LOWER_Y + droop(5.9) + 0.05, REAR], 0.005, 4))
    }
    wires.push(strut(cradleAt, [0.2, LOWER_Y + 0.95, -3.0], 0.005, 4))
    wires.push(strut(cradleAt, [-0.2, LOWER_Y + 0.95, -3.0], 0.005, 4))

    // --- Propeller blade -----------------------------------------------------
    // Laminated spruce, broad and slow, twisted hard at the root.
    const bladeRings: THREE.Vector3[][] = []
    for (let i = 0; i <= 12; i++) {
      const f = i / 12
      const r = 0.1 + f * (PROP_R - 0.1)
      const chord = 0.09 + Math.sin(Math.min(1, f * 1.15) * Math.PI) * 0.17
      // Fifty-two degrees at the root down to eleven at the tip: constant
      // pitch, which is the whole idea of treating a propeller as a wing.
      const twist = (52 - f * 41) * DEG
      const t = 0.032 * (1 - f * 0.55)
      const ring: THREE.Vector3[] = []
      for (const [u, v] of [
        [0.5, 0.45],
        [0.1, 0.5],
        [-0.5, 0.3],
        [-0.5, -0.3],
        [0.1, -0.5],
        [0.5, -0.45],
      ] as [number, number][]) {
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

    const canardSurface = (yOff: number) => {
      const halfSpan = 1.83
      const rings: THREE.Vector3[][] = []
      for (let i = 0; i <= 20; i++) {
        const x = -halfSpan + (halfSpan * 2 * i) / 20
        const edge = Math.max(0, (Math.abs(x) - (halfSpan - 0.3)) / 0.3)
        const bay = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / 0.38)
        const section = cambered(0.31, -0.31 + 0.12 * edge * edge + 0.02 * bay, 0.032, {
          bay,
          x,
          steps: 10,
        })
        rings.push(section.map(([z, dy]) => new THREE.Vector3(x, yOff + dy, z)))
      }
      return loft(rings)
    }

    // The radiator: a bank of vertical tubes on the forward centre strut.
    const radiator: THREE.BufferGeometry[] = []
    for (let i = 0; i < 9; i++) {
      const x = 0.7 + i * 0.026
      radiator.push(strut([x, LOWER_Y + 0.2, 0.62], [x, LOWER_Y + 0.92, 0.62], 0.012, 6))
    }

    return {
      upper,
      lower,
      rest,
      ribsUpper: ribGeometry(UPPER_Y),
      ribsLower: ribGeometry(LOWER_Y),
      bars: merge(bars),
      fittings: merge(fittings),
      wires: merge(wires),
      outriggers: merge(outriggers),
      tailBooms: merge(tailBooms),
      skids: merge(skids),
      radiator: merge(radiator),
      blade,
      canardUpper: canardSurface(0.32),
      canardLower: canardSurface(-0.32),
    }
  }, [])

  // --- Animation ------------------------------------------------------------
  const props = useRef<(THREE.Group | null)[]>([null, null])
  const discs = useRef<(THREE.Mesh | null)[]>([null, null])
  const rigging = useRef<THREE.Group>(null)
  const attitude = useRef<THREE.Group>(null)
  const warp = useRef(0)
  const spun = useRef(0)

  useFrame((state, dt) => {
    const k = 1 - Math.exp(-7 * dt)
    warp.current += (cradle - warp.current) * k

    // ≈350 propeller rpm at full song, and the port screw turns the other way.
    const rpm = power * 350
    spun.current = (spun.current + (rpm * 2 * Math.PI * dt) / 60) % (Math.PI * 2)
    if (props.current[0]) props.current[0].rotation.z = -spun.current
    if (props.current[1]) props.current[1].rotation.z = spun.current

    // Two broad blades at six revolutions a second do not read as two blades.
    // The disc is faint — this is a slow propeller, not a Merlin.
    for (const disc of discs.current) {
      if (!disc) continue
      const mat = disc.material as THREE.MeshBasicMaterial
      mat.opacity = Math.min(0.2, Math.max(0, power - 0.12) * 0.28)
      disc.visible = mat.opacity > 0.005
    }

    // A hundred wires in thirty miles an hour of air do not hold still. Two
    // millimetres of hum, and the whole rigging buffer moves as one.
    if (rigging.current) {
      const hum = Math.min(1, airspeed / 16) * 0.0022 + power * 0.0011
      const t = state.clock.elapsedTime
      rigging.current.position.set(
        Math.sin(t * 53.7) * hum,
        Math.sin(t * 71.3 + 1.1) * hum,
        Math.sin(t * 44.1 + 2.4) * hum * 0.6,
      )
    }

    // On the plinth the machine poses itself. Under the simulator the pilot
    // owns the attitude, and this block stands down.
    if (attitude.current && mount === 'plinth') {
      attitude.current.position.y += ((airborne ? 1.15 : 0) - attitude.current.position.y) * k
      attitude.current.rotation.x += ((airborne ? -4 * DEG : 0) - attitude.current.rotation.x) * k
      // A warped wing rolls the machine: the point of the whole mechanism.
      const bank = airborne ? warp.current * 9 * DEG : 0
      attitude.current.rotation.z += (bank - attitude.current.rotation.z) * k
    }

    // Twist the outer wing about its leading edge, in opposite senses.
    applyWarp(geo.upper, geo.rest.upper, warp.current, UPPER_Y)
    applyWarp(geo.lower, geo.rest.lower, warp.current, LOWER_Y)
  })

  // The patent's whole claim: the rudder is not a separate control, it is
  // geared to the cradle. Break the linkage and the machine is the 1902 one.
  const rudderAngle = -cradle * 12 * DEG * ((controls.linkage ?? 1) > 0.5 ? 1 : 0)

  return (
    <group ref={attitude}>
      <Part id="upper-wing">
        <mesh geometry={geo.upper} castShadow receiveShadow>
          <Mat {...MUSLIN} />
        </mesh>
        <mesh geometry={geo.ribsUpper} castShadow>
          <Mat {...ASH} />
        </mesh>
      </Part>

      <Part id="lower-wing">
        <mesh geometry={geo.lower} castShadow receiveShadow>
          <Mat {...MUSLIN} />
        </mesh>
        <mesh geometry={geo.ribsLower} castShadow>
          <Mat {...ASH} />
        </mesh>
      </Part>

      <Part id="struts">
        <mesh geometry={geo.bars} castShadow>
          <Mat {...SPRUCE} />
        </mesh>
        <mesh geometry={geo.fittings}>
          <Mat {...IRON} />
        </mesh>
      </Part>

      <Part id="rigging">
        <group ref={rigging}>
          <mesh geometry={geo.wires}>
            <Mat {...IRON} />
          </mesh>
        </group>
      </Part>

      <Part id="outriggers">
        <mesh geometry={geo.outriggers} castShadow>
          <Mat {...SPRUCE} />
        </mesh>
        <mesh geometry={geo.tailBooms} castShadow>
          <Mat {...SPRUCE} />
        </mesh>
      </Part>

      <Part id="skids">
        <mesh geometry={geo.skids} castShadow>
          <Mat {...ASH} />
        </mesh>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="canard">
        <group position={[0, LOWER_Y + 0.6, 3.0]} rotation={[elevator, 0, 0]}>
          <mesh geometry={geo.canardUpper} castShadow>
            <Mat {...MUSLIN} />
          </mesh>
          <mesh geometry={geo.canardLower} castShadow>
            <Mat {...MUSLIN} />
          </mesh>
          {/* Uprights between the two surfaces, and the bow at each tip. */}
          {[1.72, 0.9, 0, -0.9, -1.72].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.028, 0.64, 0.05]} />
              <Mat {...SPRUCE} />
            </mesh>
          ))}
          {[1.83, -1.83].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.02, 0.02, 0.66, 6]} />
              <Mat {...ASH} />
            </mesh>
          ))}
        </group>
      </Part>

      <Part id="rudder">
        <group position={[0, LOWER_Y + 0.95, -3.1]} rotation={[0, rudderAngle, 0]}>
          {[0.21, -0.21].map((x) => (
            <mesh key={x} position={[x, 0, -0.26]} castShadow>
              <boxGeometry args={[0.022, 1.83, 0.53]} />
              <Mat {...MUSLIN} />
            </mesh>
          ))}
          {/* Crossbars top and bottom, and the hinge post they swing on. */}
          {[0.94, -0.94].map((y) => (
            <mesh key={y} position={[0, y, -0.26]}>
              <boxGeometry args={[0.46, 0.028, 0.55]} />
              <Mat {...SPRUCE} />
            </mesh>
          ))}
          <mesh position={[0, 0, -0.01]}>
            <cylinderGeometry args={[0.018, 0.018, 1.9, 6]} />
            <Mat {...IRON} />
          </mesh>
          <mesh position={[0, 0, -0.52]}>
            <cylinderGeometry args={[0.012, 0.012, 1.86, 6]} />
            <Mat {...IRON} />
          </mesh>
        </group>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="engine">
        <group position={[0.52, LOWER_Y + 0.22, -0.1]}>
          {/* Cast aluminium crankcase, lying on its side on the spar. */}
          <mesh castShadow>
            <boxGeometry args={[0.34, 0.3, 0.72]} />
            <Mat {...ALLOY} />
          </mesh>
          {/* Four cylinders in a row, cast iron, with their water jackets. */}
          {[0, 1, 2, 3].map((i) => (
            <group key={i} position={[0.26, 0.04, 0.26 - i * 0.175]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.072, 0.072, 0.22, 14]} />
                <Mat color="#66696e" metalness={0.7} roughness={0.55} />
              </mesh>
              {/* Exhaust stub, straight out to starboard and no silencer. */}
              <mesh position={[0.2, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.022, 0.022, 0.16, 8]} />
                <Mat {...IRON} />
              </mesh>
            </group>
          ))}
          {/* Intake manifold: fuel dripped into it, there being no carburettor. */}
          <mesh position={[0.12, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.024, 0.024, 0.66, 8]} />
            <Mat {...BRASS} />
          </mesh>
          {/* Flywheel at the back of the crankcase, and the drive sprocket. */}
          <mesh position={[0, 0, -0.44]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.05, 20]} />
            <Mat {...IRON} />
          </mesh>
          <mesh position={[0, 0, -0.32]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.04, 14]} />
            <Mat {...IRON} />
          </mesh>
        </group>
      </Part>

      <Part id="radiator">
        {/* A bank of vertical tubes wired to the front centre strut, with the
            header tanks top and bottom, and the fuel can above them. */}
        <mesh geometry={geo.radiator} castShadow>
          <Mat {...BRASS} />
        </mesh>
        {[LOWER_Y + 0.2, LOWER_Y + 0.92].map((y) => (
          <mesh key={y} position={[0.805, y, 0.62]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.028, 0.028, 0.26, 10]} />
            <Mat {...BRASS} />
          </mesh>
        ))}
        <mesh position={[0.56, LOWER_Y + 1.0, 0.62]} castShadow>
          <cylinderGeometry args={[0.075, 0.075, 0.26, 14]} />
          <Mat {...BRASS} />
        </mesh>
        <mesh position={[0.56, LOWER_Y + 1.14, 0.62]}>
          <cylinderGeometry args={[0.022, 0.022, 0.03, 10]} />
          <Mat {...IRON} />
        </mesh>
      </Part>

      <Part id="cradle">
        <group position={[-0.34, LOWER_Y + 0.07, 0.22]}>
          {/* The plank the pilot lies on, and the padded rest under his chest. */}
          <mesh castShadow>
            <boxGeometry args={[0.42, 0.05, 1.1]} />
            <Mat color="#6f5a3c" metalness={0.05} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.06, 0.42]} castShadow>
            <boxGeometry args={[0.36, 0.07, 0.34]} />
            <Mat color="#5a4a33" metalness={0.03} roughness={0.95} />
          </mesh>
          {/* The hip saddle, sliding on its runners — the whole invention. */}
          <mesh position={[warpOffset(cradle), 0.085, -0.18]} castShadow>
            <boxGeometry args={[0.38, 0.1, 0.32]} />
            <Mat color="#4e3f2b" metalness={0.05} roughness={0.95} />
          </mesh>
          {[0.15, -0.15].map((x) => (
            <mesh key={x} position={[x, 0.04, -0.18]}>
              <boxGeometry args={[0.02, 0.02, 0.44]} />
              <Mat {...IRON} />
            </mesh>
          ))}
          {/* Elevator hand lever, forward and to port, in its quadrant. */}
          <mesh position={[0.1, 0.16, 0.56]} rotation={[-elevator * 1.4, 0, 0.2]}>
            <cylinderGeometry args={[0.014, 0.018, 0.34, 8]} />
            <Mat {...ASH} />
          </mesh>
          <mesh position={[0.1, 0.02, 0.56]}>
            <boxGeometry args={[0.05, 0.06, 0.2]} />
            <Mat {...IRON} />
          </mesh>
        </group>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="propellers">
        {[PROP_X, -PROP_X].map((x, i) => (
          <group key={x} position={[x, PROP_Y, PROP_Z]}>
            <group
              ref={(el) => {
                props.current[i] = el
              }}
            >
              {[0, 1].map((b) => (
                <group key={b} rotation={[0, 0, b * Math.PI]}>
                  <mesh geometry={geo.blade} castShadow>
                    <Mat color="#8a6a42" metalness={0.06} roughness={0.8} />
                  </mesh>
                </group>
              ))}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.055, 0.055, 0.14, 12]} />
                <Mat {...IRON} />
              </mesh>
            </group>
            <mesh
              ref={(el) => {
                discs.current[i] = el
              }}
              visible={false}
            >
              <circleGeometry args={[PROP_R, 40]} />
              <meshBasicMaterial
                color="#cbbfa6"
                transparent
                opacity={0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        ))}
      </Part>

      <Part id="transmission">
        {[PROP_X, -PROP_X].map((x) => (
          <group key={x}>
            {/* Propeller shaft in its tube, and the bearing bracket. */}
            <mesh position={[x, PROP_Y, PROP_Z + 0.32]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.7, 10]} />
              <Mat {...IRON} />
            </mesh>
            <mesh position={[x, PROP_Y, PROP_Z + 0.6]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.05, 16]} />
              <Mat {...IRON} />
            </mesh>
            {/* The post that carries the shaft off the rear spar. */}
            <mesh position={[x, (PROP_Y + UPPER_Y) / 2, PROP_Z + 0.6]}>
              <cylinderGeometry args={[0.02, 0.02, UPPER_Y - PROP_Y, 8]} />
              <Mat {...SPRUCE} />
            </mesh>
          </group>
        ))}
        {/* Chains in their guide tubes: the port one crossed, which is the
            entire mechanism that makes the two screws turn opposite ways. */}
        <ChainRun
          from={[0.52, LOWER_Y + 0.22, -0.54]}
          to={[PROP_X, PROP_Y, PROP_Z + 0.6]}
          crossed={false}
        />
        <ChainRun
          from={[0.52, LOWER_Y + 0.22, -0.54]}
          to={[-PROP_X, PROP_Y, PROP_Z + 0.6]}
          crossed
        />
      </Part>

      {/* The rail is scenery, not an exhibit part. In the simulator the sand
          has its own, properly built; on the plinth this stands in for it. */}
      {mount === 'plinth' && !airborne && (
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <boxGeometry args={[0.14, 0.06, 18.3]} />
          <meshStandardMaterial color="#6a5a44" metalness={0.03} roughness={0.95} />
        </mesh>
      )}
    </group>
  )
}

/** How far the cradle slides for a given input, in metres. */
function warpOffset(cradleInput: number) {
  return cradleInput * 0.1
}

/**
 * Twist the outer wing about its leading edge. Inboard stays put; the
 * amount grows with the square of the distance out, and the two tips go
 * opposite ways — which is the whole trick.
 */
function applyWarp(
  geometry: THREE.BufferGeometry,
  rest: Float32Array,
  amount: number,
  baseY: number,
) {
  // Rewriting every vertex and recomputing normals is not free, and the home
  // page runs three machines in one frame. Skip the work while the wing is
  // holding still — which is most of the time.
  const last = geometry.userData.warp as number | undefined
  if (last !== undefined && Math.abs(last - amount) < 2e-4) return
  geometry.userData.warp = amount

  const attr = geometry.getAttribute('position') as THREE.BufferAttribute
  const arr = attr.array as Float32Array
  const MAX = 6 * DEG

  for (let i = 0; i < arr.length; i += 3) {
    const x = rest[i]
    const y = rest[i + 1]
    const z = rest[i + 2]

    // Only the outer third warps; the braced inner bays hold their shape.
    const f = Math.max(0, (Math.abs(x) - HALF * 0.38) / (HALF * 0.62))
    if (f <= 0) {
      arr[i + 1] = y
      arr[i + 2] = z
      continue
    }
    const theta = amount * MAX * f * f * Math.sign(x)
    const pivotY = baseY + droop(x)
    const dz = z - LE
    const dy = y - pivotY
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    arr[i + 1] = pivotY + dy * c - dz * s
    arr[i + 2] = LE + dy * s + dz * c
  }
  attr.needsUpdate = true
  geometry.computeVertexNormals()
}

/** A chain run: two straight reaches in a guide tube, optionally crossed. */
function ChainRun({
  from,
  to,
  crossed,
}: {
  from: [number, number, number]
  to: [number, number, number]
  crossed: boolean
}) {
  const geometry = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    // Offset the two reaches either side of the sprockets' axis.
    const up = new THREE.Vector3(0, 0.07, 0)
    const top = strut(
      new THREE.Vector3().addVectors(a, up),
      new THREE.Vector3().addVectors(b, crossed ? up.clone().negate() : up),
      0.012,
      4,
    )
    const bottom = strut(
      new THREE.Vector3().subVectors(a, up),
      new THREE.Vector3().addVectors(b, crossed ? up : up.clone().negate()),
      0.012,
      4,
    )
    // The guide tube the chain runs inside, which is why it does not whip.
    const tube = strut(a, b, 0.026, 8)
    return merge([top, bottom, tube])
  }, [from, to, crossed])

  return (
    <mesh geometry={geometry}>
      <Mat {...IRON} />
    </mesh>
  )
}
