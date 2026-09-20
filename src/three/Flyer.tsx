import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import { loft, merge, strut } from './geometry'
import type { Controls } from '../types'

/**
 * 1903 Wright Flyer.
 *
 * Model axes: +Z forward through the canard, +X out the starboard wing,
 * +Y up, metres. The lower wing sits at skid height; everything else is
 * measured off it.
 */

const DEG = Math.PI / 180

const WOOD ={ color: '#9c7a4e', metalness: 0.08, roughness: 0.82 }
const MUSLIN = { color: '#c9bda4', metalness: 0.02, roughness: 0.95 }
const IRON = { color: '#4b4b50', metalness: 0.88, roughness: 0.42 }
const BRASS = { color: '#8a7442', metalness: 0.85, roughness: 0.4 }

const SPAN = 12.29
const HALF = SPAN / 2
const CHORD = 1.98
const GAP = 1.88
const LOWER_Y = 0.45
const UPPER_Y = LOWER_Y + GAP
const CAMBER = 1 / 20
const LE = CHORD / 2 // leading edge at +Z

/** Tips rigged low, the way the brothers flew it in a Kitty Hawk wind. */
const droop = (x: number) => -0.22 * (Math.abs(x) / HALF) ** 2

/**
 * A thin, deeply cambered surface — a circular-arc camber line with just
 * enough thickness for ribs and doped fabric. Nothing like a modern aerofoil.
 */
function cambered(chord: number, camber: number, thickness: number, steps = 16) {
  const upper: [number, number][] = []
  const lower: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const z = chord / 2 - t * chord
    // Parabolic camber line, peaking a little ahead of mid-chord.
    const y = camber * chord * 4 * (t * (1 - t)) * (1 + 0.25 * (0.5 - t))
    upper.push([z, y + thickness / 2])
    lower.push([z, y - thickness / 2])
  }
  return [...upper, ...lower.reverse()]
}

/** Loft a Flyer wing across the span, with rounded tips and anhedral. */
function wingGeometry(y0: number) {
  const stations: number[] = []
  const n = 24
  for (let i = 0; i <= n; i++) stations.push(-HALF + (SPAN * i) / n)

  const rings = stations.map((x) => {
    // Ease the chord off over the last half-metre so the tip is not a cliff.
    const edge = Math.max(0, (Math.abs(x) - (HALF - 0.45)) / 0.45)
    const shrink = 1 - 0.45 * edge * edge
    const section = cambered(CHORD * shrink, CAMBER, 0.045)
    const y = y0 + droop(x)
    return section.map(([z, dy]) => new THREE.Vector3(x, y + dy, z))
  })
  return loft(rings)
}

export function Flyer({ controls }: { controls: Controls }) {
  const power = (controls.engine ?? 0) / 100
  const cradle = (controls.cradle ?? 0) / 100
  const elevator = (controls.elevator ?? 0) * DEG
  const airborne = (controls.airborne ?? 0) > 0.5

  const geo = useMemo(() => {
    const upper = wingGeometry(UPPER_Y)
    const lower = wingGeometry(LOWER_Y)

    // Keep a pristine copy of every vertex: warping writes into the live
    // attribute each frame and needs somewhere to warp *from*.
    const rest = {
      upper: (upper.getAttribute('position').array as Float32Array).slice(),
      lower: (lower.getAttribute('position').array as Float32Array).slice(),
    }

    // --- Struts and wire bracing ------------------------------------------
    const posts = [0.55, 1.75, 2.95, 4.15, 5.35, 6.05]
    const bars: THREE.BufferGeometry[] = []
    const wires: THREE.BufferGeometry[] = []
    const columns: number[] = []
    for (const p of posts) columns.push(p, -p)
    columns.sort((a, b) => a - b)

    for (const x of columns) {
      const yl = LOWER_Y + droop(x)
      const yu = UPPER_Y + droop(x)
      // Front and rear upright of each bay.
      bars.push(strut([x, yl, LE - 0.18], [x, yu, LE - 0.18], 0.028))
      bars.push(strut([x, yl, -LE + 0.3], [x, yu, -LE + 0.3], 0.026))
    }
    for (let i = 0; i < columns.length - 1; i++) {
      const a = columns[i]
      const b = columns[i + 1]
      // Skip the centre bay: the engine and pilot live there.
      if (a < 0 && b > 0) continue
      const ya = { l: LOWER_Y + droop(a), u: UPPER_Y + droop(a) }
      const yb = { l: LOWER_Y + droop(b), u: UPPER_Y + droop(b) }
      for (const z of [LE - 0.18, -LE + 0.3]) {
        wires.push(strut([a, ya.l, z], [b, yb.u, z], 0.006, 4))
        wires.push(strut([a, ya.u, z], [b, yb.l, z], 0.006, 4))
      }
    }

    // --- Forward elevator outriggers --------------------------------------
    const outriggers: THREE.BufferGeometry[] = []
    for (const x of [0.62, -0.62]) {
      outriggers.push(strut([x, LOWER_Y + 0.02, LE - 0.1], [x, LOWER_Y + 0.28, 3.0], 0.03))
      outriggers.push(strut([x, UPPER_Y - 0.02, LE - 0.1], [x, LOWER_Y + 0.92, 3.0], 0.03))
      outriggers.push(strut([x, LOWER_Y + 0.28, 3.0], [x, LOWER_Y + 0.92, 3.0], 0.025))
    }

    // --- Rear rudder outriggers -------------------------------------------
    const tailBooms: THREE.BufferGeometry[] = []
    for (const x of [0.42, -0.42]) {
      tailBooms.push(strut([x, LOWER_Y + 0.05, -LE + 0.2], [x, LOWER_Y + 0.55, -3.1], 0.028))
      tailBooms.push(strut([x, UPPER_Y - 0.05, -LE + 0.2], [x, LOWER_Y + 1.35, -3.1], 0.028))
      tailBooms.push(strut([x, LOWER_Y + 0.55, -3.1], [x, LOWER_Y + 1.35, -3.1], 0.024))
    }

    // --- Skids -------------------------------------------------------------
    const skids: THREE.BufferGeometry[] = []
    for (const x of [0.6, -0.6]) {
      const path: [number, number][] = [
        [-2.6, 0.02],
        [-1.0, 0.0],
        [1.2, 0.0],
        [2.6, 0.06],
        [3.3, 0.3],
        [3.7, 0.72],
      ]
      for (let i = 0; i < path.length - 1; i++) {
        skids.push(
          strut(
            [x, path[i][1], path[i][0]],
            [x, path[i + 1][1], path[i + 1][0]],
            0.045,
            8,
          ),
        )
      }
      // Posts carrying the lower wing above the skids.
      for (const z of [LE - 0.2, -LE + 0.3]) {
        skids.push(strut([x, 0.0, z], [x, LOWER_Y + droop(x), z], 0.03))
      }
    }

    // --- Propeller blade ---------------------------------------------------
    // Laminated spruce, broad and slow, twisted hard at the root.
    const bladeRings: THREE.Vector3[][] = []
    for (let i = 0; i <= 10; i++) {
      const f = i / 10
      const r = 0.1 + f * 1.195
      const chord = 0.09 + Math.sin(Math.min(1, f * 1.2) * Math.PI) * 0.16
      const twist = (52 - f * 41) * DEG
      const t = 0.03 * (1 - f * 0.5)
      const ring: THREE.Vector3[] = []
      for (const [u, v] of [
        [0.5, 0.45],
        [-0.5, 0.3],
        [-0.5, -0.3],
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
      for (let i = 0; i <= 10; i++) {
        const x = -halfSpan + (halfSpan * 2 * i) / 10
        const edge = Math.max(0, (Math.abs(x) - (halfSpan - 0.3)) / 0.3)
        const section = cambered(0.62 * (1 - 0.5 * edge * edge), CAMBER, 0.035, 10)
        rings.push(section.map(([z, dy]) => new THREE.Vector3(x, yOff + dy, z)))
      }
      return loft(rings)
    }

    return {
      upper,
      lower,
      rest,
      bars: merge(bars),
      wires: merge(wires),
      outriggers: merge(outriggers),
      tailBooms: merge(tailBooms),
      skids: merge(skids),
      blade,
      canardUpper: canardSurface(0.32),
      canardLower: canardSurface(-0.32),
    }
  }, [])

  // --- Animation ------------------------------------------------------------
  const props = useRef<(THREE.Group | null)[]>([null, null])
  const attitude = useRef<THREE.Group>(null)
  const warp = useRef(0)

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-7 * dt)
    warp.current += (cradle - warp.current) * k

    // ≈350 propeller rpm at full song, and the port screw turns the other way.
    const rpm = power * 350
    const step = (rpm * 2 * Math.PI * dt) / 60
    if (props.current[0]) props.current[0].rotation.z -= step
    if (props.current[1]) props.current[1].rotation.z += step

    if (attitude.current) {
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

  const rudderAngle = -cradle * 12 * DEG

  return (
    <group ref={attitude}>
      <Part id="upper-wing">
        <mesh geometry={geo.upper} castShadow receiveShadow>
          <Mat {...MUSLIN} />
        </mesh>
      </Part>

      <Part id="lower-wing">
        <mesh geometry={geo.lower} castShadow receiveShadow>
          <Mat {...MUSLIN} />
        </mesh>
      </Part>

      <Part id="struts">
        <mesh geometry={geo.bars} castShadow>
          <Mat {...WOOD} />
        </mesh>
        <mesh geometry={geo.wires}>
          <Mat {...IRON} />
        </mesh>
        <mesh geometry={geo.outriggers} castShadow>
          <Mat {...WOOD} />
        </mesh>
        <mesh geometry={geo.tailBooms} castShadow>
          <Mat {...WOOD} />
        </mesh>
      </Part>

      <Part id="skids">
        <mesh geometry={geo.skids} castShadow>
          <Mat {...WOOD} />
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
          {[0.62, -0.62, 0].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.03, 0.64, 0.05]} />
              <Mat {...WOOD} />
            </mesh>
          ))}
        </group>
      </Part>

      <Part id="rudder">
        <group position={[0, LOWER_Y + 0.95, -3.1]} rotation={[0, rudderAngle, 0]}>
          {[0.21, -0.21].map((x) => (
            <mesh key={x} position={[x, 0, -0.26]} castShadow>
              <boxGeometry args={[0.03, 1.83, 0.53]} />
              <Mat {...MUSLIN} />
            </mesh>
          ))}
          <mesh position={[0, 0.94, -0.26]}>
            <boxGeometry args={[0.46, 0.03, 0.53]} />
            <Mat {...WOOD} />
          </mesh>
          <mesh position={[0, -0.94, -0.26]}>
            <boxGeometry args={[0.46, 0.03, 0.53]} />
            <Mat {...WOOD} />
          </mesh>
        </group>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="engine">
        <group position={[0.52, LOWER_Y + 0.22, -0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.34, 0.3, 0.72]} />
            <Mat color="#8d8f93" metalness={0.75} roughness={0.5} />
          </mesh>
          {/* Four cylinders lying on their side. */}
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              position={[0.26, 0.04, 0.26 - i * 0.175]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.072, 0.072, 0.22, 14]} />
              <Mat color="#66696e" metalness={0.7} roughness={0.55} />
            </mesh>
          ))}
          {/* Flywheel at the back of the crankcase. */}
          <mesh position={[0, 0, -0.44]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.05, 20]} />
            <Mat {...IRON} />
          </mesh>
          {/* Radiator of vertical tubes, and the fuel can above it. */}
          <mesh position={[0.32, 0.5, 0.42]}>
            <boxGeometry args={[0.07, 0.7, 0.34]} />
            <Mat {...BRASS} />
          </mesh>
          <mesh position={[0.1, 0.74, 0.1]}>
            <cylinderGeometry args={[0.07, 0.07, 0.24, 14]} />
            <Mat {...BRASS} />
          </mesh>
        </group>
      </Part>

      <Part id="cradle">
        <group position={[-0.34, LOWER_Y + 0.07, 0.22]}>
          <mesh castShadow>
            <boxGeometry args={[0.42, 0.06, 0.5]} />
            <Mat color="#6f5a3c" metalness={0.05} roughness={0.9} />
          </mesh>
          {/* The cradle itself, sliding on its runners. */}
          <mesh position={[warpOffset(cradle), 0.07, -0.05]} castShadow>
            <boxGeometry args={[0.36, 0.09, 0.3]} />
            <Mat color="#4e3f2b" metalness={0.05} roughness={0.95} />
          </mesh>
          {/* Elevator hand lever, forward and to port. */}
          <mesh position={[0.1, 0.16, 0.42]} rotation={[-elevator * 1.4, 0, 0.2]}>
            <cylinderGeometry args={[0.014, 0.018, 0.34, 8]} />
            <Mat {...WOOD} />
          </mesh>
        </group>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="propellers">
        {[1.45, -1.45].map((x, i) => (
          <group
            key={x}
            ref={(el) => {
              props.current[i] = el
            }}
            position={[x, LOWER_Y + 0.9, -1.42]}
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
        ))}
      </Part>

      <Part id="transmission">
        {[1.45, -1.45].map((x) => (
          <group key={x}>
            {/* Propeller shaft and its bearing bracket. */}
            <mesh position={[x, LOWER_Y + 0.9, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.7, 10]} />
              <Mat {...IRON} />
            </mesh>
            <mesh position={[x, LOWER_Y + 0.9, -0.82]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.05, 16]} />
              <Mat {...IRON} />
            </mesh>
          </group>
        ))}
        {/* Chains in their guide tubes: port one crossed, to counter-rotate. */}
        <ChainRun
          from={[0.52, LOWER_Y + 0.22, -0.54]}
          to={[1.45, LOWER_Y + 0.9, -0.82]}
          crossed={false}
        />
        <ChainRun
          from={[0.52, LOWER_Y + 0.22, -0.54]}
          to={[-1.45, LOWER_Y + 0.9, -0.82]}
          crossed
        />
      </Part>

      {/* The rail is scenery, not an exhibit part — it belongs to the sand. */}
      {!airborne && (
        <group position={[0, -0.01, 0]}>
          <mesh position={[0, 0.03, 0]} receiveShadow>
            <boxGeometry args={[0.14, 0.06, 18]} />
            <Mat color="#6a5a44" metalness={0.03} roughness={0.95} />
          </mesh>
        </group>
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

/** A chain run: two straight reaches between sprockets, optionally crossed. */
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
    return merge([top, bottom])
  }, [from, to, crossed])

  return (
    <mesh geometry={geometry}>
      <Mat {...IRON} />
    </mesh>
  )
}
