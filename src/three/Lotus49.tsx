import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import { loft, loftSuper, merge, strut, type SuperSection } from './geometry'
import type { Controls } from '../types'

/**
 * Lotus 49, Zandvoort specification with the 49B's strutted wing available.
 *
 * Model axes: +Z forward through the nose, +X to starboard, +Y up, metres.
 * The wheelbase is centred on the origin; the tyres sit on y = 0.
 * Everything behind the cockpit hangs off the engine and gearbox, because
 * on this car that is literally where the chassis stops.
 */

const DEG = Math.PI / 180

const GREEN = { color: '#1d4a2c', metalness: 0.45, roughness: 0.32 }
const YELLOW = { color: '#e6b422', metalness: 0.3, roughness: 0.4 }
const ALUMINIUM = { color: '#a3a8b0', metalness: 0.9, roughness: 0.3 }
const STEEL = { color: '#55595f', metalness: 0.92, roughness: 0.34 }
const MAG = { color: '#8c877a', metalness: 0.7, roughness: 0.5 }
const RUBBER = { color: '#1a1a1d', metalness: 0.05, roughness: 0.92 }
const ENGINE = { color: '#6a6d72', metalness: 0.8, roughness: 0.42 }
const DARK = { color: '#25272b', metalness: 0.4, roughness: 0.7 }

// --- Hard points ------------------------------------------------------------
const WHEELBASE = 2.36
const FRONT_Z = WHEELBASE / 2
const REAR_Z = -WHEELBASE / 2
const FRONT_X = 0.76 // 1.52 m track
const REAR_X = 0.77 // 1.54 m track
const FRONT_R = 0.3
const REAR_R = 0.33
const FRONT_W = 0.24
const REAR_W = 0.33

const ENGINE_FACE = -0.3
const NOSE_JOINT = 1.55

// --- Tub loft ---------------------------------------------------------------
// A stressed-skin box with softened corners, wide at the cockpit and
// narrowing towards the front bulkhead. It stops dead at the engine face.
const TUB: SuperSection[] = [
  { z: NOSE_JOINT, y: 0.36, halfWidth: 0.28, top: 0.22, bottom: 0.26, power: 3.2 },
  { z: 1.1, y: 0.37, halfWidth: 0.33, top: 0.26, bottom: 0.27, power: 3.2 },
  { z: 0.6, y: 0.38, halfWidth: 0.36, top: 0.28, bottom: 0.28, power: 3.2 },
  { z: 0.0, y: 0.38, halfWidth: 0.36, top: 0.25, bottom: 0.28, power: 3.2 },
  { z: ENGINE_FACE, y: 0.38, halfWidth: 0.34, top: 0.21, bottom: 0.28, power: 3.2 },
]

// Glassfibre nose, open at the tip: the oval hole is the radiator intake.
const NOSE: SuperSection[] = [
  { z: NOSE_JOINT, y: 0.36, halfWidth: 0.28, top: 0.22, bottom: 0.26, power: 2.6 },
  { z: 1.85, y: 0.35, halfWidth: 0.23, top: 0.17, bottom: 0.21, power: 2.4 },
  { z: 2.08, y: 0.34, halfWidth: 0.18, top: 0.125, bottom: 0.15, power: 2.3 },
  { z: 2.2, y: 0.34, halfWidth: 0.155, top: 0.1, bottom: 0.115, power: 2.2 },
]

/** Height of the crown at a station, following the tub then the nose. */
function crownAt(z: number) {
  const run = z > NOSE_JOINT ? NOSE : TUB
  let i = 0
  const sorted = [...run].sort((a, b) => a.z - b.z)
  while (i < sorted.length - 2 && sorted[i + 1].z < z) i++
  const p = sorted[i]
  const q = sorted[i + 1]
  const f = THREE.MathUtils.clamp((z - p.z) / (q.z - p.z), 0, 1)
  return p.y + p.top + (q.y + q.top - p.y - p.top) * f
}

export function Lotus49({ controls }: { controls: Controls }) {
  const throttle = (controls.throttle ?? 0) / 100
  const steer = (controls.steering ?? 0) * DEG
  const wingUp = (controls.wing ?? 0) / 100
  const noseOff = (controls.noseCone ?? 0) > 0.5

  // --- Geometry, built once -------------------------------------------------
  const geo = useMemo(() => {
    const tub = loftSuper(TUB, 28, { capStart: true, capEnd: true })
    const nose = loftSuper(NOSE, 28, { capStart: false, capEnd: false })

    // The yellow centre stripe, laid as a ribbon on the crown.
    const ribbon: THREE.Vector3[][] = []
    for (let z = -0.28; z <= 2.19; z += 0.08) {
      const y = crownAt(z)
      const w = z > NOSE_JOINT ? 0.05 + 0.02 * (2.2 - z) : 0.07
      ribbon.push([
        new THREE.Vector3(-w, y + 0.006, z),
        new THREE.Vector3(w, y + 0.006, z),
        new THREE.Vector3(w, y - 0.012, z),
        new THREE.Vector3(-w, y - 0.012, z),
      ])
    }
    const stripe = loft(ribbon, { capStart: false, capEnd: false })

    // The intake lip, painted to match the stripe.
    const lip = loftSuper(
      [
        { z: 2.13, y: 0.34, halfWidth: 0.17, top: 0.115, bottom: 0.13, power: 2.2 },
        { z: 2.22, y: 0.34, halfWidth: 0.16, top: 0.105, bottom: 0.12, power: 2.2 },
      ],
      28,
      { capStart: false, capEnd: false },
    )

    // Headrest fairing behind the driver, running down to the engine face.
    const headrest = loftSuper(
      [
        { z: 0.08, y: 0.66, halfWidth: 0.17, top: 0.16, bottom: 0.01, power: 2.6 },
        { z: -0.12, y: 0.65, halfWidth: 0.14, top: 0.11, bottom: 0.01, power: 2.6 },
        { z: -0.3, y: 0.62, halfWidth: 0.1, top: 0.04, bottom: 0.01, power: 2.6 },
      ],
      20,
    )

    // Windscreen: a low wrap-round pane.
    const screen = loftSuper(
      [
        { z: 0.92, y: 0.66, halfWidth: 0.2, top: 0.03, bottom: 0.0, power: 2.4 },
        { z: 0.8, y: 0.66, halfWidth: 0.26, top: 0.12, bottom: 0.0, power: 2.4 },
        { z: 0.7, y: 0.66, halfWidth: 0.28, top: 0.15, bottom: 0.0, power: 2.5 },
      ],
      20,
      { capStart: false, capEnd: false },
    )

    // Exhaust primaries: four a side, from the outer face of each head down
    // and back to a collector alongside the gearbox.
    const primaries = (side: number) =>
      merge(
        [0, 1, 2, 3].map((i) =>
          strut(
            [side * 0.34, 0.5, -0.42 - i * 0.14],
            [side * 0.27, 0.56, -1.12],
            0.021,
            8,
          ),
        ),
      )

    // Wishbones and links, as tubes between their real pick-up points.
    const frontArms = (side: number) =>
      merge([
        strut([side * 0.3, 0.52, 1.0], [side * 0.58, 0.46, FRONT_Z], 0.014),
        strut([side * 0.3, 0.52, 1.42], [side * 0.58, 0.46, FRONT_Z], 0.014),
        strut([side * 0.3, 0.19, 0.95], [side * 0.58, 0.16, FRONT_Z], 0.016),
        strut([side * 0.3, 0.19, 1.44], [side * 0.58, 0.16, FRONT_Z], 0.016),
        // Steering arm, from the rack ahead of the axle line.
        strut([side * 0.2, 0.34, 1.36], [side * 0.56, 0.34, 1.29], 0.011),
        // Coil-over damper, outboard.
        strut([side * 0.32, 0.6, 1.24], [side * 0.55, 0.26, FRONT_Z], 0.012),
      ])
    const frontSpring = (side: number) =>
      strut([side * 0.36, 0.54, 1.23], [side * 0.5, 0.33, FRONT_Z], 0.038, 12)

    const rearArms = (side: number) =>
      merge([
        // Top link off the gearbox casing.
        strut([side * 0.15, 0.6, -1.2], [side * 0.6, 0.5, REAR_Z], 0.014),
        // Reversed lower wishbone.
        strut([side * 0.15, 0.22, -1.0], [side * 0.6, 0.19, REAR_Z], 0.016),
        strut([side * 0.15, 0.22, -1.46], [side * 0.6, 0.19, REAR_Z], 0.016),
        // Twin radius rods forward to the back of the tub.
        strut([side * 0.6, 0.46, REAR_Z], [side * 0.34, 0.5, ENGINE_FACE], 0.013),
        strut([side * 0.6, 0.22, REAR_Z], [side * 0.34, 0.3, ENGINE_FACE], 0.013),
        // Coil-over.
        strut([side * 0.2, 0.64, -1.14], [side * 0.55, 0.28, REAR_Z], 0.012),
        // Driveshaft.
        strut([side * 0.16, 0.36, REAR_Z], [side * 0.58, 0.34, REAR_Z], 0.02, 10),
      ])
    const rearSpring = (side: number) =>
      strut([side * 0.26, 0.57, -1.15], [side * 0.5, 0.34, REAR_Z], 0.038, 12)

    return {
      tub,
      nose,
      stripe,
      lip,
      headrest,
      screen,
      exhaustR: primaries(1),
      exhaustL: primaries(-1),
      frontArmsR: frontArms(1),
      frontArmsL: frontArms(-1),
      frontSpringR: frontSpring(1),
      frontSpringL: frontSpring(-1),
      rearArmsR: rearArms(1),
      rearArmsL: rearArms(-1),
      rearSpringR: rearSpring(1),
      rearSpringL: rearSpring(-1),
    }
  }, [])

  // --- Animation ------------------------------------------------------------
  const spinners = useRef<(THREE.Group | null)[]>([])
  const steerers = useRef<(THREE.Group | null)[]>([])
  const wheel = useRef<THREE.Group>(null)
  const wingRef = useRef<THREE.Group>(null)
  const strutsRef = useRef<(THREE.Mesh | null)[]>([])
  const noseRef = useRef<THREE.Group>(null)
  const engineRef = useRef<THREE.Group>(null)
  const clock = useRef(0)

  const WING_LOW = 0.62
  const WING_HIGH = 1.22
  const STRUT_BASE = 0.46

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-6 * dt)
    clock.current += dt

    // Wheels: a simulator hands us real road speed; on the plinth a spinning
    // exhibit reads as running, and twelve metres a second at full throttle
    // blurs the tread without looking silly.
    const v = controls.speed !== undefined ? controls.speed / 3.6 : throttle * 12
    spinners.current.forEach((g, i) => {
      if (!g) return
      const r = i < 2 ? FRONT_R : REAR_R
      g.rotation.x += (v / r) * dt
    })

    for (const g of steerers.current) {
      if (!g) continue
      g.rotation.y += (steer - g.rotation.y) * k
    }
    if (wheel.current) {
      // The rim turns further than the road wheels do.
      wheel.current.rotation.z += (-steer * 2.6 - wheel.current.rotation.z) * k
    }

    if (wingRef.current) {
      const target = WING_LOW + (WING_HIGH - WING_LOW) * wingUp
      wingRef.current.position.y += (target - wingRef.current.position.y) * k
      const h = Math.max(0.01, wingRef.current.position.y - 0.02 - STRUT_BASE)
      for (const s of strutsRef.current) {
        if (!s) continue
        s.scale.y = h
        s.position.y = STRUT_BASE + h / 2
      }
    }

    if (noseRef.current) {
      const tz = noseOff ? 0.9 : 0
      const ty = noseOff ? 0.06 : 0
      noseRef.current.position.z += (tz - noseRef.current.position.z) * k
      noseRef.current.position.y += (ty - noseRef.current.position.y) * k
    }

    // A DFV at idle rocks on its mounts. Barely.
    if (engineRef.current) {
      const amp = throttle > 0.01 ? 0.0025 + throttle * 0.002 : 0
      engineRef.current.position.y = Math.sin(clock.current * (40 + throttle * 60)) * amp
    }
  })

  const sides = [1, -1]
  const trumpetZ = [-0.42, -0.56, -0.7, -0.84]

  return (
    <group>
      {/* ------------------------------------------------------------------ */}
      <Part id="tub">
        <mesh geometry={geo.tub} castShadow receiveShadow>
          <Mat {...GREEN} />
        </mesh>
        <mesh geometry={geo.stripe} castShadow>
          <Mat {...YELLOW} />
        </mesh>
        {/* Radiator core, sitting inside the nose behind the intake. */}
        <mesh position={[0, 0.4, 1.66]}>
          <boxGeometry args={[0.42, 0.34, 0.07]} />
          <Mat {...DARK} />
        </mesh>
        {/* Front bulkhead and the rack sitting on it. */}
        <mesh position={[0, 0.36, 1.53]}>
          <boxGeometry args={[0.5, 0.42, 0.04]} />
          <Mat {...ALUMINIUM} />
        </mesh>
        <mesh position={[0, 0.34, 1.36]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.44, 10]} />
          <Mat {...STEEL} />
        </mesh>
      </Part>

      <Part id="nose">
        <group ref={noseRef}>
          <mesh geometry={geo.nose} castShadow receiveShadow>
            <Mat {...GREEN} />
          </mesh>
          <mesh geometry={geo.lip} castShadow>
            <Mat {...YELLOW} />
          </mesh>
        </group>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <Part id="cockpit">
        {/* The opening itself. */}
        <mesh position={[0, 0.655, 0.46]}>
          <boxGeometry args={[0.46, 0.03, 0.7]} />
          <Mat {...DARK} />
        </mesh>
        <mesh geometry={geo.headrest} castShadow>
          <Mat {...GREEN} />
        </mesh>
        <mesh geometry={geo.screen}>
          <Mat color="#9fd4de" metalness={0.1} roughness={0.05} opacity={0.32} />
        </mesh>
        {/* Roll hoop: one low bar, 1967 protection. */}
        <mesh position={[0, 0.7, -0.02]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.2, 0.017, 10, 24, Math.PI]} />
          <Mat {...ALUMINIUM} />
        </mesh>
        {sides.map((side) => (
          <mesh key={side} position={[side * 0.2, 0.67, -0.02]}>
            <cylinderGeometry args={[0.017, 0.017, 0.08, 10]} />
            <Mat {...ALUMINIUM} />
          </mesh>
        ))}
        {/* Steering wheel, small and near-vertical. */}
        <group ref={wheel} position={[0, 0.6, 0.66]} rotation={[-70 * DEG, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.135, 0.014, 10, 32]} />
            <Mat color="#3b2a1d" metalness={0.2} roughness={0.6} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
              <boxGeometry args={[0.02, 0.135, 0.012]} />
              <Mat {...ALUMINIUM} />
            </mesh>
          ))}
        </group>
        {/* Mirrors on stalks. */}
        {sides.map((side) => (
          <group key={side} position={[side * 0.36, 0.72, 0.78]}>
            <mesh position={[0, -0.03, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
              <Mat {...STEEL} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[0.08, 0.05, 0.02]} />
              <Mat {...DARK} />
            </mesh>
          </group>
        ))}
      </Part>

      {/* ------------------------------------------------------------------ */}
      <group ref={engineRef}>
        <Part id="engine">
          {/* Block, with the two banks at 90°. */}
          <mesh position={[0, 0.4, -0.65]} castShadow>
            <boxGeometry args={[0.44, 0.34, 0.68]} />
            <Mat {...ENGINE} />
          </mesh>
          {sides.map((side) => (
            <mesh
              key={side}
              position={[side * 0.2, 0.55, -0.65]}
              rotation={[0, 0, side * 45 * DEG]}
              castShadow
            >
              <boxGeometry args={[0.24, 0.2, 0.64]} />
              <Mat color="#7a7d82" metalness={0.85} roughness={0.38} />
            </mesh>
          ))}
          {/* Cam covers. */}
          {sides.map((side) => (
            <mesh
              key={side}
              position={[side * 0.29, 0.64, -0.65]}
              rotation={[0, 0, side * 45 * DEG]}
            >
              <boxGeometry args={[0.16, 0.05, 0.6]} />
              <Mat color="#3a3d43" metalness={0.6} roughness={0.5} />
            </mesh>
          ))}
          {/* Eight injection trumpets standing in the V. */}
          {sides.map((side) =>
            trumpetZ.map((z) => (
              <mesh key={`${side}-${z}`} position={[side * 0.085, 0.78, z]} castShadow>
                <cylinderGeometry args={[0.045, 0.03, 0.14, 12]} />
                <Mat {...ALUMINIUM} />
              </mesh>
            )),
          )}
          {/* Bell housing at the front face, bolted to the tub. */}
          <mesh position={[0, 0.4, -0.31]}>
            <boxGeometry args={[0.5, 0.4, 0.04]} />
            <Mat {...ALUMINIUM} />
          </mesh>
        </Part>
      </group>

      <Part id="gearbox">
        <mesh position={[0, 0.38, -1.28]} castShadow>
          <boxGeometry args={[0.3, 0.32, 0.56]} />
          <Mat {...ENGINE} />
        </mesh>
        <mesh position={[0, 0.38, -1.02]}>
          <cylinderGeometry args={[0.19, 0.19, 0.08, 20]} />
          <Mat {...ALUMINIUM} />
        </mesh>
        {/* Rear plate and oil tank. */}
        <mesh position={[0, 0.38, -1.58]}>
          <boxGeometry args={[0.26, 0.28, 0.05]} />
          <Mat {...ALUMINIUM} />
        </mesh>
        <mesh position={[0, 0.62, -1.28]}>
          <cylinderGeometry args={[0.07, 0.07, 0.3, 14]} />
          <Mat {...ALUMINIUM} />
        </mesh>
      </Part>

      {/* Exhausts: primaries into a collector, megaphone aft over the box. */}
      {sides.map((side) => (
        <Part key={side} id="exhaust" mirror={side < 0}>
          <mesh geometry={side > 0 ? geo.exhaustR : geo.exhaustL} castShadow>
            <Mat color="#6d5a48" metalness={0.75} roughness={0.55} />
          </mesh>
          <mesh position={[side * 0.27, 0.57, -1.48]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.036, 0.72, 12]} />
            <Mat color="#6d5a48" metalness={0.75} roughness={0.55} />
          </mesh>
        </Part>
      ))}

      {/* ------------------------------------------------------------------ */}
      {sides.map((side) => (
        <Part key={side} id="suspension-front" mirror={side < 0}>
          <mesh geometry={side > 0 ? geo.frontArmsR : geo.frontArmsL} castShadow>
            <Mat {...STEEL} />
          </mesh>
          <mesh geometry={side > 0 ? geo.frontSpringR : geo.frontSpringL}>
            <Mat color="#8a2a2a" metalness={0.5} roughness={0.5} />
          </mesh>
          {/* Upright. */}
          <mesh position={[side * 0.6, 0.3, FRONT_Z]}>
            <boxGeometry args={[0.06, 0.34, 0.1]} />
            <Mat {...ALUMINIUM} />
          </mesh>
        </Part>
      ))}

      {sides.map((side) => (
        <Part key={side} id="suspension-rear" mirror={side < 0}>
          <mesh geometry={side > 0 ? geo.rearArmsR : geo.rearArmsL} castShadow>
            <Mat {...STEEL} />
          </mesh>
          <mesh geometry={side > 0 ? geo.rearSpringR : geo.rearSpringL}>
            <Mat color="#8a2a2a" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[side * 0.62, 0.34, REAR_Z]}>
            <boxGeometry args={[0.06, 0.36, 0.12]} />
            <Mat {...ALUMINIUM} />
          </mesh>
        </Part>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* Front wheels steer about the upright, then spin about the hub. */}
      {sides.map((side, s) => (
        <Part key={side} id="wheels" mirror={side < 0}>
          <group
            ref={(el) => {
              steerers.current[s] = el
            }}
            position={[side * FRONT_X, FRONT_R, FRONT_Z]}
          >
            <group
              ref={(el) => {
                spinners.current[s] = el
              }}
            >
              <Wheel radius={FRONT_R} width={FRONT_W} rim={0.19} side={side} />
            </group>
          </group>
        </Part>
      ))}
      {sides.map((side, s) => (
        <Part key={side} id="wheels" mirror={side < 0}>
          <group
            ref={(el) => {
              spinners.current[2 + s] = el
            }}
            position={[side * REAR_X, REAR_R, REAR_Z]}
          >
            <Wheel radius={REAR_R} width={REAR_W} rim={0.2} side={side} />
          </group>
        </Part>
      ))}

      {/* ------------------------------------------------------------------ */}
      <Part id="wing">
        <group ref={wingRef} position={[0, WING_LOW, -1.36]}>
          <mesh rotation={[-8 * DEG, 0, 0]} castShadow>
            <boxGeometry args={[1.3, 0.025, 0.36]} />
            <Mat {...GREEN} />
          </mesh>
          {sides.map((side) => (
            <mesh key={side} position={[side * 0.66, 0.02, 0]} castShadow>
              <boxGeometry args={[0.02, 0.15, 0.4]} />
              <Mat {...YELLOW} />
            </mesh>
          ))}
        </group>
        {/* Struts, straight down to the rear uprights. Unsprung. */}
        {sides.map((side, s) => (
          <mesh
            key={side}
            ref={(el) => {
              strutsRef.current[s] = el
            }}
            position={[side * 0.55, STRUT_BASE, -1.3]}
          >
            <cylinderGeometry args={[0.016, 0.016, 1, 8]} />
            <Mat {...STEEL} />
          </mesh>
        ))}
      </Part>
    </group>
  )
}

/** A treaded tyre on a cast magnesium wheel with a knock-off hub. */
function Wheel({
  radius,
  width,
  rim,
  side,
}: {
  radius: number
  width: number
  rim: number
  side: number
}) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, width, 28]} />
        <Mat {...RUBBER} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[rim, rim, width + 0.02, 24]} />
        <Mat {...MAG} />
      </mesh>
      {/* Wheel centre, dished outboard. */}
      <mesh position={[side * -(width / 2 + 0.005), 0, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[rim * 0.5, rim * 0.5, 0.02, 16]} />
        <Mat color="#3a3a3e" metalness={0.6} roughness={0.6} />
      </mesh>
      <mesh position={[side * -(width / 2 + 0.03), 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.05, 6]} />
        <Mat {...STEEL} />
      </mesh>
    </group>
  )
}
