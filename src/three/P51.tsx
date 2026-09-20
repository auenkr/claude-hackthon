import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import { liftingSurface, loft, loftSuper, type SuperSection, type WingStation } from './geometry'
import { P51_STANCE } from './stance'
import type { Controls, Mount } from '../types'

/**
 * P-51D Mustang.
 *
 * Model axes: +Z forward through the propeller, +X out the starboard wing,
 * +Y up, all in metres at 1:1. Every station below is either a published
 * dimension or interpolated between two of them.
 */

const DEG = Math.PI / 180

const ALUMINIUM = { color: '#9aa1ab', metalness: 0.92, roughness: 0.28 }
const OLIVE = { color: '#6e7480', metalness: 0.8, roughness: 0.38 }
const RUBBER = { color: '#1b1b1e', metalness: 0.1, roughness: 0.85 }
const STEEL = { color: '#5d626b', metalness: 0.95, roughness: 0.3 }
const DARK = { color: '#2a2c31', metalness: 0.5, roughness: 0.6 }

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
  const geo = loft(rings)
  const axis = new THREE.Vector3(side, 0, 0)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), -side * 5 * DEG)
    .normalize()
  return { geo, hinge, axis }
}

function Hinged({
  hinge,
  axis,
  angle,
  geometry,
  mat,
}: {
  hinge: THREE.Vector3
  axis: THREE.Vector3
  angle: number
  geometry: THREE.BufferGeometry
  mat: typeof ALUMINIUM
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
        <Mat {...mat} />
      </mesh>
    </group>
  )
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

  // --- Geometry, built once -------------------------------------------------
  const geo = useMemo(() => {
    const fuselage = loftSuper(FUSELAGE, 30)

    // One continuous wing, port tip through to starboard tip.
    const full: WingStation[] = [
      ...PANEL.slice(1).reverse().map((st) => ({ ...st, span: -st.span })),
      ...PANEL,
    ]
    const wing = liftingSurface(full)

    const tailPanel: WingStation[] = [
      { span: 0, chord: 1.42, lead: -3.3, rise: 0.02, thickness: 0.1 },
      { span: 1.1, chord: 1.2, lead: -3.24, rise: 0.05, thickness: 0.095 },
      { span: 1.8, chord: 0.98, lead: -3.18, rise: 0.07, thickness: 0.09 },
      { span: 2.02, chord: 0.78, lead: -3.16, rise: 0.08, thickness: 0.085 },
    ]
    const tail = liftingSurface([
      ...tailPanel.slice(1).reverse().map((st) => ({ ...st, span: -st.span })),
      ...tailPanel,
    ])

    // Fin: lofted up the Y axis instead of out the span.
    const fin = liftingSurface(
      [
        { span: 0.1, chord: 2.15, lead: -2.65, rise: 0, thickness: 0.11 },
        { span: 0.7, chord: 1.9, lead: -2.72, rise: 0, thickness: 0.1 },
        { span: 1.2, chord: 1.55, lead: -2.85, rise: 0, thickness: 0.09 },
        { span: 1.5, chord: 1.15, lead: -3.05, rise: 0, thickness: 0.08 },
      ],
      { vertical: true },
    )

    // Dorsal fin fillet — the cure for the bubble canopy's lost side area.
    const dorsal = new THREE.BufferGeometry()
    dorsal.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0, 0.1, -1.1, 0, 0.26, -2.55, 0.035, 0.2, -2.5, 0, 0.1, -1.1, 0.035,
          0.2, -2.5, 0.035, 0.12, -1.6, 0, 0.1, -1.1, -0.035, 0.12, -1.6,
          -0.035, 0.2, -2.5, 0, 0.1, -1.1, -0.035, 0.2, -2.5, 0, 0.26, -2.55,
        ],
        3,
      ),
    )
    dorsal.computeVertexNormals()

    // Ventral radiator duct: the Meredith-effect scoop under the spar.
    const scoop = loftSuper(
      [
        { z: 1.05, y: -0.62, halfWidth: 0.3, top: 0.08, bottom: 0.12, power: 3 },
        { z: 0.55, y: -0.72, halfWidth: 0.39, top: 0.14, bottom: 0.24, power: 3.2 },
        { z: -0.6, y: -0.76, halfWidth: 0.42, top: 0.16, bottom: 0.3, power: 3.2 },
        { z: -1.7, y: -0.72, halfWidth: 0.4, top: 0.14, bottom: 0.26, power: 3 },
        { z: -2.35, y: -0.64, halfWidth: 0.3, top: 0.1, bottom: 0.14, power: 2.8 },
      ],
      24,
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

    // Propeller blade: a twisted, tapered paddle.
    const bladeRings = []
    for (let i = 0; i <= 8; i++) {
      const f = i / 8
      const r = 0.22 + f * 1.48
      const chord = 0.1 + Math.sin(Math.min(1, f * 1.35) * Math.PI) * 0.24
      const twist = (42 - f * 34) * DEG
      const t = 0.055 * (1 - f * 0.65)
      const ring: THREE.Vector3[] = []
      for (const [u, v] of [
        [0.5, 0.5],
        [-0.5, 0.35],
        [-0.5, -0.35],
        [0.5, -0.5],
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

    return {
      fuselage,
      wing,
      tail,
      fin,
      dorsal,
      scoop,
      windscreen,
      hood,
      blade,
      spinner,
      flapR,
      flapL,
      ailR,
      ailL,
    }
  }, [])

  // --- Animation ------------------------------------------------------------
  const prop = useRef<THREE.Group>(null)
  const disc = useRef<THREE.Mesh>(null)
  const stance = useRef<THREE.Group>(null)
  const gearRef = useRef<THREE.Group[]>([])
  const tailGear = useRef<THREE.Group>(null)
  const hoodRef = useRef<THREE.Group>(null)

  // Ground attitude: both main wheels and the tailwheel on the floor at once.
  const GROUND_PITCH = P51_STANCE.pitch
  const GROUND_RISE = P51_STANCE.rise

  useFrame((_, dt) => {
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
    if (hoodRef.current) {
      const target = canopyOpen ? -0.62 : 0
      hoodRef.current.position.z += (target - hoodRef.current.position.z) * k
    }
  })

  const gunStations = [1.25, 1.72, 2.19]
  const exhaustStacks = [0, 1, 2, 3, 4, 5]

  return (
    <group
      ref={stance}
      position={mount === 'free' ? [0, 0, 0] : [0, GROUND_RISE, 0]}
      rotation={mount === 'free' ? [0, 0, 0] : [-GROUND_PITCH, 0, 0]}
    >
      {/* ---------------------------------------------------------------- */}
      <Part id="fuselage">
        <mesh geometry={geo.fuselage} castShadow receiveShadow>
          <Mat {...ALUMINIUM} />
        </mesh>
        {/* Cockpit: something to see through the hood. */}
        <mesh position={[0, 0.18, -0.05]} castShadow>
          <boxGeometry args={[0.52, 0.06, 0.95]} />
          <Mat {...DARK} />
        </mesh>
        <mesh position={[0, 0.34, -0.32]}>
          <boxGeometry args={[0.44, 0.34, 0.06]} />
          <Mat color="#3a3d44" metalness={0.3} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.5, 1.02]}>
          <boxGeometry args={[0.46, 0.3, 0.1]} />
          <Mat color="#17181b" metalness={0.2} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.34, 0.42]}>
          <cylinderGeometry args={[0.018, 0.022, 0.34, 8]} />
          <Mat {...STEEL} />
        </mesh>
        {/* Radio mast. */}
        <mesh position={[0, 0.42, -1.15]} rotation={[-0.25, 0, 0]}>
          <cylinderGeometry args={[0.01, 0.022, 0.5, 6]} />
          <Mat {...DARK} />
        </mesh>
      </Part>

      <Part id="canopy">
        <mesh geometry={geo.windscreen}>
          <Mat color="#9fd4de" metalness={0.1} roughness={0.05} opacity={0.34} />
        </mesh>
        <group ref={hoodRef}>
          <mesh geometry={geo.hood}>
            <Mat color="#9fd4de" metalness={0.1} roughness={0.05} opacity={0.3} />
          </mesh>
        </group>
      </Part>

      {/* ---------------------------------------------------------------- */}
      <Part id="wing">
        <mesh geometry={geo.wing} castShadow receiveShadow>
          <Mat {...ALUMINIUM} />
        </mesh>
        {/* Wing root fairings. */}
        {[1, -1].map((side) => (
          <mesh key={side} position={[side * 0.52, -0.15, 0.3]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.42, 16, 12]} />
            <Mat {...ALUMINIUM} />
          </mesh>
        ))}
      </Part>

      <Part id="flaps">
        <Hinged
          hinge={geo.flapR.hinge}
          axis={geo.flapR.axis}
          geometry={geo.flapR.geo}
          angle={flapAngle}
          mat={ALUMINIUM}
        />
      </Part>
      <Part id="flaps" mirror>
        <Hinged
          hinge={geo.flapL.hinge}
          axis={geo.flapL.axis}
          geometry={geo.flapL.geo}
          angle={flapAngle}
          mat={ALUMINIUM}
        />
      </Part>

      {/* Ailerons move in opposition: one up, one down. */}
      <Part id="ailerons">
        <Hinged
          hinge={geo.ailR.hinge}
          axis={geo.ailR.axis}
          geometry={geo.ailR.geo}
          angle={-roll}
          mat={ALUMINIUM}
        />
      </Part>
      <Part id="ailerons" mirror>
        <Hinged
          hinge={geo.ailL.hinge}
          axis={geo.ailL.axis}
          geometry={geo.ailL.geo}
          angle={roll}
          mat={ALUMINIUM}
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
              {/* Blade cuff. */}
              <mesh position={[0.3, 0, 4.16]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.075, 0.085, 0.22, 10]} />
                <Mat {...STEEL} />
              </mesh>
            </group>
          ))}
          <mesh geometry={geo.spinner} castShadow>
            <Mat color="#b23a32" metalness={0.6} roughness={0.35} />
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
      </Part>

      <Part id="exhaust">
        {exhaustStacks.map((i) => (
          <mesh
            key={i}
            position={[0.46, 0.12, 3.92 - i * 0.2]}
            rotation={[0, 0, Math.PI / 2 - 0.35]}
          >
            <cylinderGeometry args={[0.052, 0.062, 0.16, 8]} />
            <Mat color="#6b4a33" metalness={0.7} roughness={0.65} />
          </mesh>
        ))}
      </Part>
      <Part id="exhaust" mirror>
        {exhaustStacks.map((i) => (
          <mesh
            key={i}
            position={[-0.46, 0.12, 3.92 - i * 0.2]}
            rotation={[0, 0, -Math.PI / 2 + 0.35]}
          >
            <cylinderGeometry args={[0.052, 0.062, 0.16, 8]} />
            <Mat color="#6b4a33" metalness={0.7} roughness={0.65} />
          </mesh>
        ))}
      </Part>

      {/* ---------------------------------------------------------------- */}
      <Part id="radiator">
        <mesh geometry={geo.scoop} castShadow receiveShadow>
          <Mat {...ALUMINIUM} />
        </mesh>
        {/* Radiator face, visible in the inlet. */}
        <mesh position={[0, -0.74, 0.5]}>
          <boxGeometry args={[0.6, 0.34, 0.08]} />
          <Mat color="#1f2124" metalness={0.4} roughness={0.9} />
        </mesh>
        {/* Thermostatic exit door. */}
        <mesh position={[0, -0.86, -2.0]} rotation={[0.22, 0, 0]}>
          <boxGeometry args={[0.66, 0.03, 0.5]} />
          <Mat {...ALUMINIUM} />
        </mesh>
      </Part>

      <Part id="guns">
        {gunStations.map((x, i) => {
          const st = atSpan(x)
          return (
            <group key={i}>
              <mesh
                position={[x, st.rise + 0.02, st.lead + 0.18]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.021, 0.024, 0.55, 10]} />
                <Mat {...STEEL} />
              </mesh>
              <mesh position={[x, st.rise + 0.02, st.lead - 0.55]}>
                <boxGeometry args={[0.11, 0.13, 1.05]} />
                <Mat {...DARK} />
              </mesh>
            </group>
          )
        })}
      </Part>
      <Part id="guns" mirror>
        {gunStations.map((x, i) => {
          const st = atSpan(x)
          return (
            <group key={i}>
              <mesh
                position={[-x, st.rise + 0.02, st.lead + 0.18]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.021, 0.024, 0.55, 10]} />
                <Mat {...STEEL} />
              </mesh>
              <mesh position={[-x, st.rise + 0.02, st.lead - 0.55]}>
                <boxGeometry args={[0.11, 0.13, 1.05]} />
                <Mat {...DARK} />
              </mesh>
            </group>
          )
        })}
      </Part>

      {/* ---------------------------------------------------------------- */}
      <Part id="tailplane">
        <mesh geometry={geo.tail} castShadow receiveShadow>
          <Mat {...ALUMINIUM} />
        </mesh>
        {[1, -1].map((side) => (
          <group key={side} position={[side * 1.0, 0.05, -4.05]}>
            <mesh rotation={[elevator, 0, 0]} position={[0, 0, -0.26]}>
              <boxGeometry args={[1.95, 0.06, 0.52]} />
              <Mat {...ALUMINIUM} />
            </mesh>
          </group>
        ))}
      </Part>

      <Part id="fin">
        <mesh geometry={geo.fin} castShadow receiveShadow>
          <Mat {...ALUMINIUM} />
        </mesh>
        <mesh geometry={geo.dorsal} castShadow>
          <Mat {...ALUMINIUM} />
        </mesh>
        <group position={[0, 0.85, -3.95]} rotation={[0, rudder, 0]}>
          <mesh position={[0, 0, -0.3]}>
            <boxGeometry args={[0.06, 1.45, 0.6]} />
            <Mat {...ALUMINIUM} />
          </mesh>
        </group>
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
              <mesh position={[0, -0.52, 0]}>
                <cylinderGeometry args={[0.062, 0.072, 1.0, 12]} />
                <Mat {...STEEL} />
              </mesh>
              <mesh position={[0, -1.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.343, 0.343, 0.17, 22]} />
                <Mat {...RUBBER} />
              </mesh>
              <mesh position={[0, -1.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.16, 0.16, 0.19, 16]} />
                <Mat {...OLIVE} />
              </mesh>
              {/* Gear door, hinged on the strut. */}
              <mesh position={[side * 0.11, -0.5, 0.02]}>
                <boxGeometry args={[0.03, 0.95, 0.62]} />
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
          <mesh position={[0, -0.34, 0.06]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.159, 0.159, 0.1, 16]} />
            <Mat {...RUBBER} />
          </mesh>
        </group>
      </Part>
    </group>
  )
}
