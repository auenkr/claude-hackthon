import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import { Skin } from './t34/Skin'
import { buildLotus49 } from './lotus49/parts'
import {
  DEG,
  EXHAUST_TIPS,
  FRONT_R,
  FRONT_X,
  FRONT_Z,
  PICKUP_F,
  PICKUP_R,
  REAR_R,
  REAR_X,
  REAR_Z,
  RPM_IDLE,
  RPM_LIMIT,
  STEERING_WHEEL,
  STEER_RATIO,
  TRAVEL,
  UPRIGHT_F,
  UPRIGHT_R,
  WING,
} from './lotus49/dims'
import type { Controls } from '../types'

/**
 * Lotus 49, Zandvoort specification, with the 49B's strutted wing available.
 *
 * Model axes: +Z forward through the nose, +X to starboard, +Y up, metres.
 * The tyres sit on y = 0 and the wheelbase is centred on the origin.
 *
 * Nothing here is keyframed. The wheels turn at road speed over their own
 * radius and steer about their uprights; under braking the tub dives on its
 * springs and the wishbones follow it, the discs glow, and on the overrun
 * the megaphones spit. In the simulator all of that is driven by the
 * physics; on the plinth the sliders stand in for it.
 */

/** The channels a simulator may add beyond the exhibit's own sliders. */
const readChannels = (c: Controls) => ({
  throttle: (c.throttle ?? 0) / 100,
  brakes: (c.brakes ?? 0) / 100,
  steer: (c.steering ?? 0) * DEG,
  wingUp: (c.wing ?? 0) / 100,
  noseOff: (c.noseCone ?? 0) > 0.5,
  /** km/h, from a simulator; otherwise the throttle stands in. */
  speed: c.speed,
  rpm: c.rpm,
  /** 0–100: nose down under braking, tail down under power, roll to a side. */
  dive: c.dive,
  squat: c.squat,
  roll: c.roll,
  /** Frames of flame at the megaphones, counted by the simulator. */
  pops: c.pops ?? 0,
})

export function Lotus49({ controls }: { controls: Controls }) {
  const ch = readChannels(controls)
  const geo = useMemo(() => buildLotus49(), [])

  // --- Refs the frame loop drives ------------------------------------------
  const body = useRef<THREE.Group>(null)
  const spinners = useRef<(THREE.Group | null)[]>([])
  const steerers = useRef<(THREE.Group | null)[]>([])
  const hubs = useRef<(THREE.Group | null)[]>([])
  const uppers = useRef<(THREE.Group | null)[]>([])
  const lowers = useRef<(THREE.Group | null)[]>([])
  const discs = useRef<(THREE.Mesh | null)[]>([])
  const wheelRim = useRef<THREE.Group>(null)
  const helmet = useRef<THREE.Group>(null)
  const wingRef = useRef<THREE.Group>(null)
  const struts = useRef<(THREE.Mesh | null)[]>([])
  const noseRef = useRef<THREE.Group>(null)
  const engineRef = useRef<THREE.Group>(null)
  const tips = useRef<(THREE.Mesh | null)[]>([])
  const flames = useRef<(THREE.Mesh | null)[]>([])
  const clock = useRef(0)
  const lastPops = useRef(ch.pops)
  const flame = useRef(0)

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-8 * dt)
    clock.current += dt

    // On the plinth the sliders imply the rest; a simulator supplies it.
    const v = ch.speed !== undefined ? ch.speed / 3.6 : ch.throttle * 12
    const rpm = ch.rpm ?? RPM_IDLE + ch.throttle * (RPM_LIMIT - 800 - RPM_IDLE)
    const dive = (ch.dive ?? ch.brakes * 100) / 100
    const squat = (ch.squat ?? ch.throttle * 35) / 100
    const roll = (ch.roll ?? 0) * DEG

    // --- Wheels: spin at road speed, steer about the uprights ---------------
    spinners.current.forEach((g, i) => {
      if (!g) return
      g.rotation.x += (v / (i < 2 ? FRONT_R : REAR_R)) * dt
    })
    for (const g of steerers.current) {
      if (g) g.rotation.y += (ch.steer - g.rotation.y) * k
    }
    if (wheelRim.current) {
      wheelRim.current.rotation.z += (-ch.steer * STEER_RATIO - wheelRim.current.rotation.z) * k
    }
    if (helmet.current) {
      // The driver looks into the corner and leans against the g.
      helmet.current.rotation.y += (ch.steer * 1.4 - helmet.current.rotation.y) * k
      helmet.current.rotation.z += (-roll * 1.5 - helmet.current.rotation.z) * k
    }

    // --- Suspension: the tub moves, the wheels stay on the road -----------
    // Positive dive drops the nose; positive squat drops the tail; roll
    // drops the outside. The wishbones rotate about their inboard pivots to
    // follow, which is exactly the motion the real arms make.
    const dropF = dive * TRAVEL - squat * TRAVEL * 0.3
    const dropR = squat * TRAVEL - dive * TRAVEL * 0.25
    if (body.current) {
      const pitch = Math.atan2(dropF - dropR, FRONT_Z - REAR_Z)
      body.current.rotation.x += (pitch - body.current.rotation.x) * k
      body.current.rotation.z += (roll * 0.55 - body.current.rotation.z) * k
      body.current.position.y += (-(dropF + dropR) / 2 - body.current.position.y) * k
    }
    const armF = UPRIGHT_F.x - PICKUP_F.upper.x
    const armR = UPRIGHT_R.x - PICKUP_R.lower.x
    uppers.current.forEach((g, i) => {
      if (!g) return
      const side = i % 2 === 0 ? 1 : -1
      const drop = (i < 2 ? dropF : dropR) + side * Math.sin(roll) * 0.35
      const target = side * Math.asin(THREE.MathUtils.clamp(drop / (i < 2 ? armF : armR), -0.5, 0.5))
      g.rotation.z += (target - g.rotation.z) * k
    })
    lowers.current.forEach((g, i) => {
      if (!g) return
      const side = i % 2 === 0 ? 1 : -1
      const drop = (i < 2 ? dropF : dropR) + side * Math.sin(roll) * 0.35
      const target = side * Math.asin(THREE.MathUtils.clamp(drop / (i < 2 ? armF : armR), -0.5, 0.5))
      g.rotation.z += (target - g.rotation.z) * k
    })

    // --- Brakes: Girling discs run orange when worked ----------------------
    discs.current.forEach((m, i) => {
      if (!m) return
      const mat = m.material as THREE.MeshStandardMaterial
      const heat = ch.brakes * ch.brakes * (i < 2 ? 1 : 0.6) * Math.min(1, v / 20)
      mat.emissiveIntensity += (heat * 2.6 - mat.emissiveIntensity) * (1 - Math.exp(-3 * dt))
    })

    // --- Exhaust: heat in the megaphones, flame on the overrun -------------
    if (ch.pops !== lastPops.current) {
      lastPops.current = ch.pops
      flame.current = 1
    }
    flame.current = Math.max(0, flame.current - dt * 9)
    const heat = (rpm / RPM_LIMIT) * (0.25 + 0.75 * ch.throttle)
    tips.current.forEach((m) => {
      if (!m) return
      const mat = m.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity += (heat * 0.9 - mat.emissiveIntensity) * (1 - Math.exp(-1.5 * dt))
    })
    flames.current.forEach((m, i) => {
      if (!m) return
      const lit = flame.current > 0.05 && Math.sin(clock.current * 80 + i * 2) > -0.3
      m.visible = lit
      m.scale.set(0.8 + Math.random() * 0.5, 0.8 + Math.random() * 0.5, 0.6 + flame.current * 1.4)
    })

    // --- Wing on its struts, nose on its fasteners -------------------------
    if (wingRef.current) {
      const target = WING.low + (WING.high - WING.low) * ch.wingUp
      wingRef.current.position.y += (target - wingRef.current.position.y) * k
      const h = Math.max(0.01, wingRef.current.position.y - 0.02 - WING.strutBase)
      for (const s of struts.current) if (s) s.scale.y = h
    }
    if (noseRef.current) {
      noseRef.current.position.z += ((ch.noseOff ? 0.9 : 0) - noseRef.current.position.z) * k
      noseRef.current.position.y += ((ch.noseOff ? 0.06 : 0) - noseRef.current.position.y) * k
    }

    // A DFV rocks on its mounts: a lumpy idle, a fine buzz at nine thousand.
    if (engineRef.current) {
      const amp = 0.0015 + (rpm / RPM_LIMIT) * 0.0012
      engineRef.current.position.y = Math.sin(clock.current * (rpm / 60) * 0.5) * amp
    }
  })

  const sides = [1, -1]

  return (
    <group>
      {/* --- Everything that rides on the springs --------------------------- */}
      <group ref={body}>
        <Part id="tub">
          <mesh geometry={geo.tub} castShadow receiveShadow>
            <Skin metalness={0.45} roughness={0.35} />
          </mesh>
        </Part>

        <Part id="nose">
          <group ref={noseRef}>
            <mesh geometry={geo.nose} castShadow receiveShadow>
              <Skin metalness={0.4} roughness={0.35} />
            </mesh>
          </group>
        </Part>

        <Part id="cockpit">
          <mesh geometry={geo.cockpit} castShadow>
            <Skin metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh geometry={geo.screen}>
            <Mat color="#9fd4de" metalness={0.1} roughness={0.05} opacity={0.32} />
          </mesh>
          <group
            ref={wheelRim}
            position={[0, STEERING_WHEEL.y, STEERING_WHEEL.z]}
            rotation={[STEERING_WHEEL.rake, 0, 0]}
          >
            <mesh geometry={geo.steeringWheel} castShadow>
              <Skin metalness={0.3} roughness={0.6} />
            </mesh>
          </group>
        </Part>

        <Part id="driver">
          <mesh geometry={geo.driver} castShadow>
            <Skin metalness={0.05} roughness={0.9} />
          </mesh>
          <group ref={helmet} position={[0, 0.84, 0.16]}>
            <mesh geometry={geo.helmet} castShadow>
              <Skin metalness={0.3} roughness={0.35} />
            </mesh>
          </group>
        </Part>

        <group ref={engineRef}>
          <Part id="engine">
            <mesh geometry={geo.engine} castShadow>
              <Skin metalness={0.75} roughness={0.45} />
            </mesh>
          </Part>
        </group>

        <Part id="gearbox">
          <mesh geometry={geo.gearbox} castShadow>
            <Skin metalness={0.7} roughness={0.5} />
          </mesh>
        </Part>

        {sides.map((side, s) => (
          <Part key={side} id="exhaust" mirror={side < 0}>
            <mesh geometry={s === 0 ? geo.exhaustR : geo.exhaustL} castShadow>
              <Skin metalness={0.7} roughness={0.55} />
            </mesh>
            {/* The last hand's breadth of megaphone, which shows the heat. */}
            <mesh
              ref={(el) => {
                tips.current[s] = el
              }}
              position={[EXHAUST_TIPS[s][0], EXHAUST_TIPS[s][1], EXHAUST_TIPS[s][2] + 0.1]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.05, 0.063, 0.22, 12, 1, true]} />
              <meshStandardMaterial
                color="#6b5443"
                emissive="#ff6a1a"
                emissiveIntensity={0}
                metalness={0.7}
                roughness={0.5}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh
              ref={(el) => {
                flames.current[s] = el
              }}
              position={[EXHAUST_TIPS[s][0], EXHAUST_TIPS[s][1], EXHAUST_TIPS[s][2] - 0.14]}
              rotation={[-Math.PI / 2, 0, 0]}
              visible={false}
            >
              <coneGeometry args={[0.05, 0.3, 8]} />
              <meshBasicMaterial
                color="#ffb347"
                transparent
                opacity={0.85}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </Part>
        ))}

        {/* Wishbones pivot on the tub and gearbox, so they ride with the body. */}
        {sides.map((side, s) => (
          <Part key={side} id="suspension-front" mirror={side < 0}>
            <group
              ref={(el) => {
                uppers.current[s] = el
              }}
              position={[side * PICKUP_F.upper.x, PICKUP_F.upper.y, 0]}
            >
              <mesh geometry={s === 0 ? geo.frontUpperR : geo.frontUpperL} castShadow>
                <Skin metalness={0.85} roughness={0.4} />
              </mesh>
            </group>
            <group
              ref={(el) => {
                lowers.current[s] = el
              }}
              position={[side * PICKUP_F.lower.x, PICKUP_F.lower.y, 0]}
            >
              <mesh geometry={s === 0 ? geo.frontLowerR : geo.frontLowerL} castShadow>
                <Skin metalness={0.85} roughness={0.4} />
              </mesh>
            </group>
            <mesh geometry={s === 0 ? geo.frontStaticR : geo.frontStaticL} castShadow>
              <Skin metalness={0.8} roughness={0.45} />
            </mesh>
          </Part>
        ))}
        {sides.map((side, s) => (
          <Part key={side} id="suspension-rear" mirror={side < 0}>
            <group
              ref={(el) => {
                uppers.current[2 + s] = el
              }}
              position={[side * PICKUP_R.top.x, PICKUP_R.top.y, PICKUP_R.top.z]}
            >
              <mesh geometry={s === 0 ? geo.rearTopR : geo.rearTopL} castShadow>
                <Skin metalness={0.85} roughness={0.4} />
              </mesh>
            </group>
            <group
              ref={(el) => {
                lowers.current[2 + s] = el
              }}
              position={[side * PICKUP_R.lower.x, PICKUP_R.lower.y, 0]}
            >
              <mesh geometry={s === 0 ? geo.rearLowerR : geo.rearLowerL} castShadow>
                <Skin metalness={0.85} roughness={0.4} />
              </mesh>
            </group>
            <mesh geometry={s === 0 ? geo.rearStaticR : geo.rearStaticL} castShadow>
              <Skin metalness={0.8} roughness={0.45} />
            </mesh>
          </Part>
        ))}
      </group>

      {/* --- Everything that stands on the road ---------------------------- */}
      {/* Front: the upright steers, the wheel spins inside it. */}
      {sides.map((side, s) => (
        <group key={`f${side}`}>
          <Part id="suspension-front" mirror={side < 0}>
            <group
              ref={(el) => {
                steerers.current[s] = el
              }}
              position={[side * UPRIGHT_F.x, UPRIGHT_F.y, FRONT_Z]}
            >
              <mesh geometry={geo.uprightF} castShadow>
                <Skin metalness={0.85} roughness={0.4} />
              </mesh>
              <Part id="brakes" mirror={side < 0}>
                <mesh
                  ref={(el) => {
                    discs.current[s] = el
                  }}
                  geometry={geo.discF}
                  position={[side * 0.09, 0, 0]}
                >
                  <meshStandardMaterial
                    color="#55585e"
                    emissive="#ff5a12"
                    emissiveIntensity={0}
                    metalness={0.85}
                    roughness={0.45}
                  />
                </mesh>
              </Part>
              <Part id="wheels" mirror={side < 0}>
                <group
                  ref={(el) => {
                    hubs.current[s] = el
                  }}
                  position={[side * (FRONT_X - UPRIGHT_F.x), 0, 0]}
                >
                  <group
                    ref={(el) => {
                      spinners.current[s] = el
                    }}
                  >
                    <mesh geometry={s === 0 ? geo.wheelFR : geo.wheelFL} castShadow>
                      <Skin metalness={0.55} roughness={0.7} />
                    </mesh>
                  </group>
                </group>
              </Part>
            </group>
          </Part>
        </group>
      ))}
      {/* Rear: fixed uprights, wheels spinning, the wing struts standing on them. */}
      {sides.map((side, s) => (
        <group key={`r${side}`} position={[side * UPRIGHT_R.x, UPRIGHT_R.y, REAR_Z]}>
          <Part id="suspension-rear" mirror={side < 0}>
            <mesh geometry={geo.uprightR} castShadow>
              <Skin metalness={0.85} roughness={0.4} />
            </mesh>
          </Part>
          <Part id="brakes" mirror={side < 0}>
            <mesh
              ref={(el) => {
                discs.current[2 + s] = el
              }}
              geometry={geo.discR}
              position={[side * 0.09, 0, 0]}
            >
              <meshStandardMaterial
                color="#55585e"
                emissive="#ff5a12"
                emissiveIntensity={0}
                metalness={0.85}
                roughness={0.45}
              />
            </mesh>
          </Part>
          <Part id="wheels" mirror={side < 0}>
            <group
              ref={(el) => {
                spinners.current[2 + s] = el
              }}
              position={[side * (REAR_X - UPRIGHT_R.x), 0, 0]}
            >
              <mesh geometry={s === 0 ? geo.wheelRR : geo.wheelRL} castShadow>
                <Skin metalness={0.55} roughness={0.7} />
              </mesh>
            </group>
          </Part>
        </group>
      ))}

      <Part id="wing">
        <group ref={wingRef} position={[0, WING.low, WING.z]}>
          <mesh geometry={geo.wing} castShadow>
            <Skin metalness={0.45} roughness={0.35} />
          </mesh>
        </group>
        {/* Struts straight down to the rear uprights. Unsprung, as raced. */}
        {sides.map((side, s) => (
          <mesh
            key={side}
            ref={(el) => {
              struts.current[s] = el
            }}
            geometry={geo.strut}
            position={[side * WING.strutX, WING.strutBase, WING.z + 0.06]}
          >
            <Skin metalness={0.85} roughness={0.4} />
          </mesh>
        ))}
      </Part>
    </group>
  )
}
