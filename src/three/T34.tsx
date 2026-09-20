import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Part } from './Part'
import { Skin } from './t34/Skin'
import { buildT34, turretNumberTexture } from './t34/parts'
import { sampleBelt } from './geometry'
import {
  ARM,
  CUPOLA,
  DEG,
  GLACIS,
  IDLER,
  LOADER,
  NOSE,
  NOSE_Y,
  RING_Y,
  RING_Z,
  SPROCKET,
  TRACK_X,
  TRUNNION,
  TURRET_H,
  WHEEL_R,
  WHEEL_Z,
} from './t34/dims'
import type { Controls } from '../types'

/**
 * T-34-85, Factory No. 183, Model 1944.
 *
 * Model axes: +Z forward over the glacis, +Y up, metres — which makes +X the
 * port side. The driver's hatch, the commander's cupola and the tow cable are
 * therefore all at positive X, and the hull machine gun, the loader's hatch
 * and the tool boxes at negative X, exactly as they are on the vehicle.
 *
 * Nothing here is keyframed. The wheels turn at road speed over their own
 * radius, the track links are laid along an arc-length parametrisation of the
 * belt at the tank's own travel, the swing arms follow the wheels they carry,
 * and the gun recoils 330 mm and comes back on its recuperator.
 */

/** Hinge line of the driver's hatch, measured up the glacis from the nose. */
const HATCH_V = 1.04
/** Recoil stroke of the ZiS-S-53. */
const RECOIL = 0.33

export function T34({ controls }: { controls: Controls }) {
  const speed = controls.speed ?? 0
  const traverse = (controls.traverse ?? 0) * DEG
  const elevation = (controls.elevation ?? 0) * DEG
  const rough = (controls.terrain ?? 0) / 100
  const hatchesOpen = (controls.hatches ?? 0) > 0.5
  const shots = controls.shots ?? 0
  const mgFiring = (controls.mg ?? 0) > 0.5

  const geo = useMemo(() => buildT34(), [])
  const number = useMemo(() => turretNumberTexture('213'), [])

  // --- Refs the frame loop drives ------------------------------------------
  const body = useRef<THREE.Group>(null)
  const wheels = useRef<(THREE.Group | null)[]>([])
  const arms = useRef<(THREE.Group | null)[]>([])
  const sprockets = useRef<(THREE.Group | null)[]>([])
  const idlers = useRef<(THREE.Group | null)[]>([])
  const flats = useRef<(THREE.InstancedMesh | null)[]>([null, null])
  const horns = useRef<(THREE.InstancedMesh | null)[]>([null, null])
  const driver = useRef<THREE.Group>(null)
  const leafA = useRef<THREE.Group>(null)
  const leafB = useRef<THREE.Group>(null)
  const loader = useRef<THREE.Group>(null)
  const recoil = useRef<THREE.Group>(null)
  const flash = useRef<THREE.Mesh>(null)
  const flashLight = useRef<THREE.PointLight>(null)
  const mgFlash = useRef<THREE.Mesh>(null)

  const travel = useRef(0)
  const clock = useRef(0)
  const kick = useRef(0)
  const lastShot = useRef(shots)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((state, dt) => {
    const k = 1 - Math.exp(-6 * dt)
    const v = speed / 3.6
    travel.current += v * dt
    clock.current += dt * (0.6 + v * 0.22)

    // A round has gone off: start the recoil stroke and the flash.
    if (shots !== lastShot.current) {
      lastShot.current = shots
      kick.current = 1
    }
    kick.current = Math.max(0, kick.current - dt * 2.2)

    // Christie springs: each wheel rides its own bump, phased down the hull.
    const bump = (i: number) =>
      rough *
      0.085 *
      (Math.sin(clock.current * 3.1 + i * 1.9) + 0.6 * Math.sin(clock.current * 5.7 + i * 3.3))

    wheels.current.forEach((g, i) => {
      if (!g) return
      g.position.y = WHEEL_R + bump(i % 5)
      g.rotation.x -= (v / WHEEL_R) * dt
    })
    arms.current.forEach((g, i) => {
      if (!g) return
      g.rotation.x = -Math.atan2(ARM.dy - bump(i % 5), ARM.dz)
    })
    for (const g of sprockets.current) if (g) g.rotation.x -= (v / SPROCKET.r) * dt
    for (const g of idlers.current) if (g) g.rotation.x -= (v / IDLER.r) * dt

    // The hull rides the average of the wheels and pitches with the ends.
    if (body.current) {
      const front = bump(0)
      const rear = bump(4)
      body.current.position.y += ((front + rear) * 0.5 - body.current.position.y) * k
      body.current.rotation.x += ((rear - front) * 0.09 - body.current.rotation.x) * k
      body.current.rotation.z += (bump(2) * 0.05 - body.current.rotation.z) * k
    }

    // Hatches. The driver's swings up and forward off its glacis plane; the
    // cupola's splits into two leaves that fold back either side.
    const open = hatchesOpen ? 1 : 0
    if (driver.current) {
      const target = GLACIS - open * 78 * DEG
      driver.current.rotation.x += (target - driver.current.rotation.x) * k
    }
    if (leafA.current) leafA.current.rotation.z += (open * 100 * DEG - leafA.current.rotation.z) * k
    if (leafB.current) leafB.current.rotation.z += (-open * 100 * DEG - leafB.current.rotation.z) * k
    if (loader.current) loader.current.rotation.x += (-open * 95 * DEG - loader.current.rotation.x) * k

    // Recoil: out fast, back slowly, which is what the recuperator does.
    if (recoil.current) {
      const t = kick.current
      const stroke = t > 0.72 ? (1 - t) / 0.28 : t / 0.72
      recoil.current.position.z = -RECOIL * stroke
    }

    // Muzzle flash: two frames of it, but that is all a flash ever is.
    const blast = Math.max(0, kick.current - 0.82) / 0.18
    if (flash.current) {
      flash.current.visible = blast > 0.01
      flash.current.scale.setScalar(0.35 + blast * 1.5)
      const mat = flash.current.material as THREE.MeshBasicMaterial
      mat.opacity = blast
    }
    if (flashLight.current) flashLight.current.intensity = blast * 260

    if (mgFlash.current) {
      // The DT is firing at ten rounds a second; flicker it off the clock
      // rather than off a counter nothing else needs.
      const lit = mgFiring && Math.sin(state.clock.elapsedTime * 62) > 0
      mgFlash.current.visible = lit
      mgFlash.current.scale.setScalar(0.5 + Math.random() * 0.5)
    }

    // Lay the links along the belt, offset by how far the tank has driven.
    for (let s = 0; s < 2; s++) {
      const flat = flats.current[s]
      const horn = horns.current[s]
      if (!flat || !horn) continue
      let a = 0
      let b = 0
      for (let i = 0; i < geo.links; i++) {
        const p = sampleBelt(geo.belt, i * geo.pitch + travel.current)
        dummy.position.set(0, p.y, p.x)
        dummy.rotation.set(-p.angle, 0, 0)
        dummy.updateMatrix()
        if (i % 2 === 0) flat.setMatrixAt(a++, dummy.matrix)
        else horn.setMatrixAt(b++, dummy.matrix)
      }
      flat.instanceMatrix.needsUpdate = true
      horn.instanceMatrix.needsUpdate = true
    }
  })

  const sides = [1, -1]
  const half = geo.links / 2

  return (
    <group ref={body}>
      {/* --- Hull ------------------------------------------------------- */}
      <Part id="hull">
        <mesh geometry={geo.hull} castShadow receiveShadow>
          <Skin />
        </mesh>
        <group
          ref={driver}
          position={[
            0.44,
            NOSE_Y + HATCH_V * Math.sin(GLACIS) + 0.03 * Math.cos(GLACIS),
            NOSE - HATCH_V * Math.cos(GLACIS) + 0.03 * Math.sin(GLACIS),
          ]}
          rotation={[GLACIS, 0, 0]}
        >
          <mesh geometry={geo.driverHatch} castShadow>
            <Skin />
          </mesh>
        </group>
      </Part>

      <Part id="deck">
        <mesh geometry={geo.deck} castShadow receiveShadow>
          <Skin />
        </mesh>
      </Part>

      <Part id="hullmg">
        <mesh geometry={geo.hullMg} castShadow>
          <Skin />
        </mesh>
        <mesh ref={mgFlash} position={[-0.46, 1.16, 3.02]} visible={false}>
          <coneGeometry args={[0.07, 0.24, 7]} />
          <meshBasicMaterial
            color="#ffd489"
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </Part>

      <Part id="engine">
        <mesh geometry={geo.engine} castShadow>
          <Skin metalness={0.75} roughness={0.5} />
        </mesh>
      </Part>

      {sides.map((side, s) => (
        <Part key={side} id="fenders" mirror={side < 0}>
          <mesh geometry={s === 0 ? geo.fenderPort : geo.fenderStbd} castShadow receiveShadow>
            <Skin metalness={0.5} roughness={0.8} />
          </mesh>
        </Part>
      ))}

      {sides.map((side, s) => (
        <Part key={side} id="stowage" mirror={side < 0}>
          <mesh geometry={s === 0 ? geo.stowagePort : geo.stowageStbd} castShadow>
            <Skin />
          </mesh>
        </Part>
      ))}

      {/* --- Turret ----------------------------------------------------- */}
      <group position={[0, RING_Y, RING_Z]} rotation={[0, traverse, 0]}>
        <Part id="turret">
          <mesh geometry={geo.turret} castShadow receiveShadow>
            <Skin metalness={0.5} roughness={0.78} />
          </mesh>
          {number && (
            <>
              <mesh geometry={geo.decalPort}>
                <meshStandardMaterial
                  map={number}
                  transparent
                  alphaTest={0.35}
                  roughness={0.85}
                  metalness={0.1}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh geometry={geo.decalStbd}>
                <meshStandardMaterial
                  map={number}
                  transparent
                  alphaTest={0.35}
                  roughness={0.85}
                  metalness={0.1}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </>
          )}
          <group ref={loader} position={[LOADER.x, TURRET_H, LOADER.z - LOADER.r]}>
            <mesh geometry={geo.loaderHatch} castShadow>
              <Skin />
            </mesh>
          </group>
        </Part>

        <Part id="cupola">
          <group position={[CUPOLA.x, TURRET_H - 0.02, CUPOLA.z]}>
            <mesh geometry={geo.cupola} castShadow>
              <Skin metalness={0.5} roughness={0.78} />
            </mesh>
            <group ref={leafA} position={[0, 0.25, 0]}>
              <mesh geometry={geo.cupolaLeafA} castShadow>
                <Skin />
              </mesh>
            </group>
            <group ref={leafB} position={[0, 0.25, 0]}>
              <mesh geometry={geo.cupolaLeafB} castShadow>
                <Skin />
              </mesh>
            </group>
          </group>
        </Part>

        {/* The gun and its mantlet elevate together about the trunnions.
            +Z is forward, so lifting the muzzle is a negative rotation. */}
        <group position={[0, TRUNNION.y, TRUNNION.z]} rotation={[-elevation, 0, 0]}>
          <Part id="mantlet">
            <mesh geometry={geo.mantlet} castShadow>
              <Skin metalness={0.5} roughness={0.78} />
            </mesh>
          </Part>

          <Part id="gun">
            <group ref={recoil}>
              <mesh geometry={geo.gun} castShadow>
                <Skin metalness={0.72} roughness={0.5} />
              </mesh>
            </group>
          </Part>

          <mesh ref={flash} position={[0, 0, 4.85]} visible={false}>
            <coneGeometry args={[0.36, 1.3, 9]} />
            <meshBasicMaterial
              color="#ffe6a8"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            ref={flashLight}
            position={[0, 0, 4.9]}
            color="#ffdca0"
            intensity={0}
            distance={40}
            decay={2}
          />
        </group>
      </group>

      {/* --- Running gear ----------------------------------------------- */}
      <Part id="suspension">
        <mesh geometry={geo.springs}>
          <Skin metalness={0.7} roughness={0.55} />
        </mesh>
        {sides.map((side, s) =>
          WHEEL_Z.map((z, i) => (
            <group
              key={`${side}:${i}`}
              ref={(el) => {
                arms.current[s * 5 + i] = el
              }}
              position={[side * ARM.x, WHEEL_R + ARM.dy, z + ARM.dz]}
            >
              <mesh geometry={geo.arm} castShadow>
                <Skin />
              </mesh>
            </group>
          )),
        )}
      </Part>

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
                  <Skin metalness={0.6} roughness={0.7} />
                </mesh>
              </group>
            ))}
          </Part>

          <Part id="idler" mirror={side < 0}>
            <mesh geometry={geo.idlerCrank} position={[side * 1.06, IDLER.y + 0.08, IDLER.z]}>
              <Skin />
            </mesh>
            <group
              ref={(el) => {
                idlers.current[s] = el
              }}
              position={[side * TRACK_X, IDLER.y, IDLER.z]}
            >
              <mesh geometry={geo.idler} castShadow>
                <Skin metalness={0.6} roughness={0.7} />
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
                <Skin metalness={0.7} roughness={0.6} />
              </mesh>
            </group>
          </Part>

          <Part id="tracks" mirror={side < 0}>
            <instancedMesh
              ref={(el) => {
                flats.current[s] = el
              }}
              args={[geo.linkFlat, undefined, half]}
              position={[side * TRACK_X, 0, 0]}
              castShadow
              receiveShadow
              frustumCulled={false}
            >
              <Skin metalness={0.75} roughness={0.55} />
            </instancedMesh>
            <instancedMesh
              ref={(el) => {
                horns.current[s] = el
              }}
              args={[geo.linkHorn, undefined, half]}
              position={[side * TRACK_X, 0, 0]}
              castShadow
              receiveShadow
              frustumCulled={false}
            >
              <Skin metalness={0.75} roughness={0.55} />
            </instancedMesh>
          </Part>
        </group>
      ))}
    </group>
  )
}
