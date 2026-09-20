import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import {
  beltPath,
  loft,
  merge,
  roundedRing,
  sampleBelt,
  strut,
  type Circle,
} from './geometry'
import type { Controls } from '../types'

/**
 * T-34-85, Factory No. 183, Model 1944.
 *
 * Model axes: +Z forward over the glacis, +X to starboard, +Y up, metres.
 * The hull is lofted from cross-sections whose plate angles come straight
 * from the armour schedule.
 */

const DEG = Math.PI / 180

const ARMOUR = { color: '#5b6350', metalness: 0.62, roughness: 0.66 }
const CAST = { color: '#646b58', metalness: 0.55, roughness: 0.78 }
const STEEL = { color: '#4a4d52', metalness: 0.9, roughness: 0.38 }
const TRACK = { color: '#3f4248', metalness: 0.85, roughness: 0.5 }
const RUBBER = { color: '#1d1d20', metalness: 0.1, roughness: 0.9 }

// --- Hull envelope ----------------------------------------------------------
const FLOOR = 0.4 // ground clearance, per the manual
const LOWER_TOP = 0.83 // top of the vertical lower side
const SPONSON_TOP = 1.43 // top of the 40° sponson side
const DECK = 1.6 // hull roof
const HW_LOWER = 0.93
const HW_SPONSON = 1.43
const HW_DECK = 1.4

const NOSE = 3.05
const STERN = -3.05

interface HullStation {
  z: number
  floor: number
  deck: number
  /** Scales the section's width, for the tapered nose and tail. */
  pinch?: number
}

// Glacis at 60° from vertical climbs from the nose joint to the deck edge;
// the rear deck slopes away over the transmission.
const HULL: HullStation[] = [
  { z: NOSE, floor: LOWER_TOP, deck: LOWER_TOP + 0.01, pinch: 0.86 },
  { z: 2.85, floor: 0.62, deck: 1.0, pinch: 0.92 },
  { z: 2.55, floor: FLOOR, deck: 1.16, pinch: 0.97 },
  { z: 2.1, floor: FLOOR, deck: 1.38, pinch: 1 },
  { z: 1.72, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: 0.6, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: -0.6, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: -1.4, floor: FLOOR, deck: DECK, pinch: 1 },
  { z: -2.3, floor: FLOOR, deck: 1.32, pinch: 1 },
  { z: -2.65, floor: FLOOR, deck: 1.14, pinch: 0.99 },
  { z: STERN, floor: 0.72, deck: 1.0, pinch: 0.95 },
]

/** One hull cross-section: lower vertical sides, 40° sponsons, flat roof. */
function hullRing(st: HullStation) {
  const k = st.pinch ?? 1
  const deck = st.deck
  // Collapse the sponson break as the section runs out at nose and tail.
  const sponson = Math.min(SPONSON_TOP, Math.max(st.floor, deck - 0.17))
  const lower = Math.min(LOWER_TOP, Math.max(st.floor, sponson - 0.01))
  const pts: [number, number][] = [
    [HW_LOWER * k, st.floor],
    [HW_LOWER * k, lower],
    [HW_SPONSON * k, sponson],
    [HW_DECK * k, deck],
    [-HW_DECK * k, deck],
    [-HW_SPONSON * k, sponson],
    [-HW_LOWER * k, lower],
    [-HW_LOWER * k, st.floor],
  ]
  return pts.map(([x, y]) => new THREE.Vector3(x, y, st.z))
}

// --- Running gear -----------------------------------------------------------
const WHEEL_R = 0.415 // 830 mm diameter
const WHEEL_Z = [2.05, 0.98, 0.02, -0.94, -1.9]
const IDLER = { z: 2.6, y: 0.44, r: 0.37 }
const SPROCKET = { z: -2.62, y: 0.52, r: 0.32 }
const TRACK_X = 1.25
const TRACK_W = 0.5
const LINKS = 72

export function T34({ controls }: { controls: Controls }) {
  const speed = controls.speed ?? 0
  const traverse = (controls.traverse ?? 0) * DEG
  const elevation = (controls.elevation ?? 0) * DEG
  const rough = (controls.terrain ?? 0) / 100
  const hatchesOpen = (controls.hatches ?? 0) > 0.5

  const geo = useMemo(() => {
    const hull = loft(HULL.map(hullRing))

    // Turret: a casting that narrows 20° as it rises, with a rear bustle.
    const turretProfile = (y: number, shrink: number) =>
      roundedRing(
        [
          { angle: Math.PI / 2, radius: 1.05 - shrink },
          { angle: Math.PI / 4, radius: 1.12 - shrink },
          { angle: 0, radius: 1.1 - shrink },
          { angle: -Math.PI / 4, radius: 1.24 - shrink },
          { angle: -Math.PI / 2, radius: 1.34 - shrink },
          { angle: (-3 * Math.PI) / 4, radius: 1.24 - shrink },
          { angle: Math.PI, radius: 1.1 - shrink },
          { angle: (3 * Math.PI) / 4, radius: 1.12 - shrink },
        ],
        48,
        y,
      )
    const turret = loft([
      turretProfile(0, 0.06),
      turretProfile(0.06, 0),
      turretProfile(0.55, 0.19),
      turretProfile(0.92, 0.3),
      turretProfile(1.0, 0.38),
    ])

    // Road wheel: twin dished discs with a rubber tyre.
    const wheelRings: THREE.Vector3[][] = []
    for (const [r, w] of [
      [0.12, 0.13],
      [0.3, 0.14],
      [WHEEL_R - 0.07, 0.14],
      [WHEEL_R, 0.13],
      [WHEEL_R, -0.13],
      [WHEEL_R - 0.07, -0.14],
      [0.3, -0.14],
      [0.12, -0.13],
    ] as [number, number][]) {
      const ring: THREE.Vector3[] = []
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2
        ring.push(new THREE.Vector3(w, Math.sin(t) * r, Math.cos(t) * r))
      }
      wheelRings.push(ring)
    }
    const wheel = loft(wheelRings)

    // The belt: idler, over the road wheels, round the sprocket, back along
    // the ground. Each wheel appears twice — once for the top run, once for
    // the bottom — which is exactly how the track actually lies.
    const circles: Circle[] = [
      { x: IDLER.z, y: IDLER.y, r: IDLER.r },
      ...WHEEL_Z.map((z) => ({ x: z, y: WHEEL_R, r: WHEEL_R })),
      { x: SPROCKET.z, y: SPROCKET.y, r: SPROCKET.r },
      ...[...WHEEL_Z].reverse().map((z) => ({ x: z, y: WHEEL_R, r: WHEEL_R })),
    ]
    const belt = beltPath(circles, 8)

    // One track link, centred on the origin, lying flat.
    const pitch = belt.length / LINKS
    const link = merge([
      boxGeo(TRACK_W, 0.035, pitch * 0.92),
      boxGeo(0.07, 0.11, pitch * 0.3, 0, 0.06, 0),
    ])

    // Sprocket: roller teeth that engage the track pins.
    const teeth: THREE.BufferGeometry[] = []
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * Math.PI * 2
      teeth.push(
        strut(
          [-0.11, Math.sin(t) * SPROCKET.r, Math.cos(t) * SPROCKET.r],
          [0.11, Math.sin(t) * SPROCKET.r, Math.cos(t) * SPROCKET.r],
          0.035,
        ),
      )
    }
    const sprocket = merge([
      ...teeth,
      cylGeo(0.26, 0.09, 20, Math.PI / 2),
      cylGeo(0.1, 0.24, 12, Math.PI / 2),
    ])

    return { hull, turret, wheel, belt, link, pitch, sprocket }
  }, [])

  // --- Animation ------------------------------------------------------------
  const tracks = useRef<(THREE.InstancedMesh | null)[]>([null, null])
  const wheels = useRef<(THREE.Group | null)[]>([])
  const sprockets = useRef<(THREE.Group | null)[]>([])
  const idlers = useRef<(THREE.Group | null)[]>([])
  const body = useRef<THREE.Group>(null)
  const hatch = useRef<THREE.Group>(null)
  const travel = useRef(0)
  const clock = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-6 * dt)
    const v = speed / 3.6 // km/h to m/s
    travel.current += v * dt
    clock.current += dt * (0.6 + v * 0.22)

    // Christie springs: each wheel rides its own bump, phased down the hull.
    const bump = (i: number) =>
      rough *
      0.09 *
      (Math.sin(clock.current * 3.1 + i * 1.9) +
        0.6 * Math.sin(clock.current * 5.7 + i * 3.3))

    wheels.current.forEach((g, i) => {
      if (!g) return
      g.position.y = WHEEL_R + bump(i % 5)
      g.rotation.x -= (v / WHEEL_R) * dt
    })
    for (const g of sprockets.current) if (g) g.rotation.x -= (v / SPROCKET.r) * dt
    for (const g of idlers.current) if (g) g.rotation.x -= (v / IDLER.r) * dt

    // The hull rides the average of the wheels, and pitches with the ends.
    if (body.current) {
      const front = bump(0)
      const rear = bump(4)
      body.current.position.y += ((front + rear) * 0.5 - body.current.position.y) * k
      body.current.rotation.x += ((rear - front) * 0.09 - body.current.rotation.x) * k
      body.current.rotation.z += (bump(2) * 0.05 - body.current.rotation.z) * k
    }

    if (hatch.current) {
      const target = hatchesOpen ? -115 * DEG : 0
      hatch.current.rotation.x += (target - hatch.current.rotation.x) * k
    }

    // Lay the links along the belt, offset by how far the tank has driven.
    for (const mesh of tracks.current) {
      if (!mesh) continue
      for (let i = 0; i < LINKS; i++) {
        const p = sampleBelt(geo.belt, i * geo.pitch + travel.current)
        dummy.position.set(0, p.y, p.x)
        dummy.rotation.set(-p.angle, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  const sides = [1, -1]

  return (
    <group ref={body}>
      {/* ------------------------------------------------------------------ */}
      <Part id="hull">
        <mesh geometry={geo.hull} castShadow receiveShadow>
          <Mat {...ARMOUR} />
        </mesh>
        {/* Driver's hatch in the glacis. */}
        <mesh position={[-0.44, 1.26, 2.24]} rotation={[-60 * DEG, 0, 0]}>
          <boxGeometry args={[0.6, 0.56, 0.05]} />
          <Mat {...ARMOUR} />
        </mesh>
        {/* Engine deck louvres. */}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[0, 1.6, -1.55 - i * 0.16]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[1.5, 0.02, 0.1]} />
            <Mat {...STEEL} />
          </mesh>
        ))}
        {/* Turret ring collar. */}
        <mesh position={[0, 1.57, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.82, 0.82, 0.09, 40]} />
          <Mat {...STEEL} />
        </mesh>
      </Part>

      <Part id="hullmg">
        <mesh position={[0.46, 1.2, 2.32]} rotation={[-60 * DEG, 0, 0]}>
          <sphereGeometry args={[0.16, 16, 12]} />
          <Mat {...CAST} />
        </mesh>
        <mesh position={[0.46, 1.32, 2.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.032, 0.42, 10]} />
          <Mat {...STEEL} />
        </mesh>
      </Part>

      <Part id="fenders">
        {sides.map((side) => (
          <group key={side}>
            <mesh position={[side * 1.32, 1.02, 0.1]} castShadow>
              <boxGeometry args={[0.58, 0.03, 5.5]} />
              <Mat {...STEEL} />
            </mesh>
            {/* External fuel drums on the rear fender. */}
            <mesh
              position={[side * 1.34, 1.2, -2.15]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.17, 0.17, 0.72, 14]} />
              <Mat color="#5a6150" metalness={0.5} roughness={0.75} />
            </mesh>
            {/* Spare track links, stowed on the glacis fender. */}
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[side * 1.3, 1.08, 1.9 - i * 0.2]}>
                <boxGeometry args={[0.46, 0.06, 0.16]} />
                <Mat {...TRACK} />
              </mesh>
            ))}
          </group>
        ))}
      </Part>

      <Part id="engine">
        <mesh position={[0, 1.05, -1.95]} castShadow>
          <boxGeometry args={[1.1, 0.78, 1.25]} />
          <Mat color="#3c4148" metalness={0.75} roughness={0.5} />
        </mesh>
        {sides.map((side) => (
          <mesh
            key={side}
            position={[side * 0.3, 1.25, -1.95]}
            rotation={[0, 0, side * 0.52]}
          >
            <boxGeometry args={[0.34, 0.3, 1.15]} />
            <Mat color="#494f57" metalness={0.8} roughness={0.45} />
          </mesh>
        ))}
        {/* Transmission, behind the engine at the drive end. */}
        <mesh position={[0, 0.85, -2.72]}>
          <boxGeometry args={[1.3, 0.62, 0.5]} />
          <Mat {...STEEL} />
        </mesh>
      </Part>

      {/* ------------------------------------------------------------------ */}
      <group position={[0, DECK, 0.1]} rotation={[0, traverse, 0]}>
        <Part id="turret">
          <mesh geometry={geo.turret} castShadow receiveShadow>
            <Mat {...CAST} />
          </mesh>
          {/* Loader's hatch. */}
          <mesh position={[0.42, 1.01, -0.2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.04, 20]} />
            <Mat {...ARMOUR} />
          </mesh>
          {/* Gunner's periscope. */}
          <mesh position={[-0.35, 1.06, 0.25]}>
            <boxGeometry args={[0.16, 0.12, 0.2]} />
            <Mat {...STEEL} />
          </mesh>
          {/* Lifting eyes. */}
          {sides.map((side) => (
            <mesh key={side} position={[side * 0.55, 0.96, -0.75]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.09, 0.025, 8, 14, Math.PI]} />
              <Mat {...CAST} />
            </mesh>
          ))}
        </Part>

        <Part id="cupola">
          <mesh position={[-0.38, 1.04, -0.42]} castShadow>
            <cylinderGeometry args={[0.31, 0.33, 0.14, 24]} />
            <Mat {...CAST} />
          </mesh>
          {/* Five vision slits. */}
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2
            return (
              <mesh
                key={i}
                position={[-0.38 + Math.cos(a) * 0.32, 1.04, -0.42 + Math.sin(a) * 0.32]}
                rotation={[0, -a, 0]}
              >
                <boxGeometry args={[0.03, 0.05, 0.14]} />
                <Mat color="#101114" metalness={0.3} roughness={0.9} />
              </mesh>
            )
          })}
          <group ref={hatch} position={[-0.38, 1.11, -0.72]}>
            <mesh position={[0, 0, 0.3]} castShadow>
              <cylinderGeometry args={[0.3, 0.3, 0.05, 24]} />
              <Mat {...ARMOUR} />
            </mesh>
          </group>
        </Part>

        {/* Gun and mantlet elevate together about the trunnions. */}
        <group position={[0, 0.45, 0.6]} rotation={[elevation, 0, 0]}>
          <Part id="mantlet">
            <mesh position={[0, 0, 0.42]} castShadow>
              <boxGeometry args={[0.86, 0.62, 0.3]} />
              <Mat {...CAST} />
            </mesh>
            <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.28, 0.28, 0.34, 20]} />
              <Mat {...CAST} />
            </mesh>
            {/* Coaxial DT machine gun. */}
            <mesh position={[0.2, -0.04, 0.72]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.03, 0.3, 10]} />
              <Mat {...STEEL} />
            </mesh>
          </Part>

          <Part id="gun">
            {/* Breech end, inside the turret. */}
            <mesh position={[0, 0, -0.2]}>
              <boxGeometry args={[0.36, 0.36, 0.7]} />
              <Mat {...STEEL} />
            </mesh>
            {/* 4.64 m of barrel: L/54.6 at 85 mm. */}
            <mesh position={[0, 0, 2.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.062, 0.082, 3.3, 20]} />
              <Mat {...STEEL} />
            </mesh>
            <mesh position={[0, 0, 0.75]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.095, 0.105, 0.6, 20]} />
              <Mat {...STEEL} />
            </mesh>
            <mesh position={[0, 0, 3.86]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.12, 20]} />
              <Mat {...STEEL} />
            </mesh>
          </Part>
        </group>
      </group>

      {/* ------------------------------------------------------------------ */}
      {sides.map((side, s) => (
        <group key={side}>
          <Part id="wheels" mirror={side < 0}>
            {WHEEL_Z.map((z, i) => (
              <group
                key={i}
                ref={(el) => {
                  wheels.current[s * 5 + i] = el
                }}
                position={[side * TRACK_X, WHEEL_R, z]}
              >
                <mesh geometry={geo.wheel} castShadow>
                  <Mat {...STEEL} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.075, 24]} />
                  <Mat {...RUBBER} />
                </mesh>
              </group>
            ))}
          </Part>

          <Part id="idler" mirror={side < 0}>
            <group
              ref={(el) => {
                idlers.current[s] = el
              }}
              position={[side * TRACK_X, IDLER.y, IDLER.z]}
            >
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[IDLER.r, IDLER.r, 0.22, 22]} />
                <Mat {...STEEL} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[IDLER.r - 0.05, IDLER.r - 0.05, 0.27, 22]} />
                <Mat {...RUBBER} />
              </mesh>
            </group>
          </Part>

          <Part id="sprocket" mirror={side < 0}>
            <group
              ref={(el) => {
                sprockets.current[s] = el
              }}
              position={[side * TRACK_X, SPROCKET.y, SPROCKET.z]}
            >
              <mesh geometry={geo.sprocket} castShadow>
                <Mat {...STEEL} />
              </mesh>
            </group>
          </Part>

          <Part id="tracks" mirror={side < 0}>
            <instancedMesh
              ref={(el) => {
                tracks.current[s] = el
              }}
              args={[geo.link, undefined, LINKS]}
              position={[side * TRACK_X, 0, 0]}
              castShadow
              receiveShadow
            >
              <Mat {...TRACK} />
            </instancedMesh>
          </Part>
        </group>
      ))}
    </group>
  )
}

// --- Small primitives used by the merged assemblies -------------------------

function boxGeo(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  g.translate(x, y, z)
  return g
}

function cylGeo(r: number, h: number, seg: number, rotZ: number) {
  const g = new THREE.CylinderGeometry(r, r, h, seg).toNonIndexed()
  g.rotateZ(rotZ)
  return g
}
