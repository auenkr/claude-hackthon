import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Part } from './Part'
import { loftSuper, merge, strut } from './geometry'
import { VELO } from './stance'
import type { Controls } from '../types'

/**
 * Michaux pedal velocipede, c. 1868.
 *
 * Model axes: +Z forward, +X to the rider's right, +Y up, metres, with the
 * origin on the ground midway between the wheels. The perch is one forged
 * bar, drawn as a tube along the curve a smith would have hammered it to.
 */

const DEG = Math.PI / 180

const IRON = { color: '#1b1b1d', metalness: 0.7, roughness: 0.55 }
const BRIGHT = { color: '#5a5c60', metalness: 0.9, roughness: 0.35 }
const WOOD = { color: '#8a6a44', metalness: 0.05, roughness: 0.8 }
const TYRE = { color: '#35363a', metalness: 0.85, roughness: 0.5 }
const LEATHER = { color: '#4a3426', metalness: 0.05, roughness: 0.85 }
const BRASS = { color: '#b08d57', metalness: 0.85, roughness: 0.35 }

const { frontR, rearR, frontZ, rearZ, rake, crank } = VELO
const AXLE_Y = frontR

/** Point on the steering axis `s` metres up from the front axle. */
const onAxis = (s: number): [number, number, number] => [
  0,
  AXLE_Y + s * Math.cos(rake),
  frontZ - s * Math.sin(rake),
]

const HEAD_LOW = 0.45
const HEAD_HIGH = 0.62
const BAR_S = 0.66

const CROWN: [number, number, number] = [0, 0.68, -0.18]
const TAIL: [number, number, number] = [0, 0.9, -0.46]
const PIVOT: [number, number, number] = [0, 0.9, -0.47]

export function Velocipede({ controls }: { controls: Controls }) {
  const speed = controls.speed ?? 0
  const steer = (controls.steer ?? 0) * DEG
  const lean = (controls.lean ?? 0) * DEG
  const braking = (controls.brake ?? 0) > 0.5

  const geo = useMemo(() => {
    const spokes = (R: number) =>
      merge(
        Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          return strut(
            [0, Math.sin(a) * 0.04, Math.cos(a) * 0.04],
            [0, Math.sin(a) * (R - 0.02), Math.cos(a) * (R - 0.02)],
            0.011,
            8,
          )
        }),
      )

    const head = onAxis(HEAD_LOW + 0.02)
    const perch = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(head[0], head[1], head[2] - 0.03),
        new THREE.Vector3(0, 0.88, 0.2),
        new THREE.Vector3(0, 0.76, 0.0),
        new THREE.Vector3(0, 0.69, -0.12),
        new THREE.Vector3(...CROWN),
        new THREE.Vector3(0, 0.8, -0.34),
        new THREE.Vector3(...TAIL),
      ]),
      48,
      0.017,
      8,
      false,
    )

    const spring = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.7, -0.22),
        new THREE.Vector3(0, 0.8, -0.26),
        new THREE.Vector3(0, 0.9, -0.2),
        new THREE.Vector3(0, 0.935, -0.06),
        new THREE.Vector3(0, 0.925, 0.06),
      ]),
      32,
      0.007,
      6,
      false,
    )

    const saddle = loftSuper(
      [
        { z: 0.13, y: 0, halfWidth: 0.022, top: 0.014, bottom: 0.012, power: 2.4 },
        { z: 0.04, y: 0.004, halfWidth: 0.045, top: 0.018, bottom: 0.014, power: 2.4 },
        { z: -0.05, y: 0.008, halfWidth: 0.085, top: 0.024, bottom: 0.016, power: 2.6 },
        { z: -0.14, y: 0.006, halfWidth: 0.08, top: 0.02, bottom: 0.014, power: 2.6 },
      ],
      20,
    )

    const rearFork = merge(
      [1, -1].map((side) => strut(CROWN, [side * 0.07, rearR, rearZ], 0.013, 8)),
    )
    const blades = merge(
      [1, -1].map((side) => strut([side * 0.075, 0, 0], [side * 0.03, HEAD_LOW, 0], 0.013, 8)),
    )
    const barAt = onAxis(BAR_S)
    const cord = strut([0, 0.97, -0.46], [barAt[0], barAt[1] - 0.02, barAt[2] - 0.03], 0.003, 5)

    return { front: spokes(frontR), rear: spokes(rearR), perch, spring, saddle, rearFork, blades, cord }
  }, [])

  const body = useRef<THREE.Group>(null)
  const steering = useRef<THREE.Group>(null)
  const frontWheel = useRef<THREE.Group>(null)
  const rearWheel = useRef<THREE.Group>(null)
  const cranks = useRef<THREE.Group>(null)
  const bar = useRef<THREE.Group>(null)
  const lever = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-6 * dt)
    const v = speed / 3.6

    if (frontWheel.current) frontWheel.current.rotation.x -= (v / frontR) * dt
    if (rearWheel.current) rearWheel.current.rotation.x -= (v / rearR) * dt
    // Direct drive: the cranks are keyed to the front axle.
    if (cranks.current && frontWheel.current) {
      cranks.current.rotation.x = frontWheel.current.rotation.x
    }

    if (body.current) body.current.rotation.z += (-lean - body.current.rotation.z) * k
    if (steering.current) steering.current.rotation.y += (steer - steering.current.rotation.y) * k

    const twist = braking ? 0.5 : 0
    if (bar.current) bar.current.rotation.x += (twist - bar.current.rotation.x) * k
    const lift = braking ? 0 : 0.26
    if (lever.current) lever.current.rotation.x += (lift - lever.current.rotation.x) * k
  })

  const sides = [1, -1]

  return (
    <group ref={body}>
      {/* ------------------------------------------------------------------ */}
      <Part id="frame">
        <mesh geometry={geo.perch} castShadow>
          <Mat {...IRON} />
        </mesh>
        {/* Steering head: an iron socket the fork turns in. */}
        <mesh position={onAxis((HEAD_LOW + HEAD_HIGH) / 2)} rotation={[-rake, 0, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.03, HEAD_HIGH - HEAD_LOW, 16]} />
          <Mat {...IRON} />
        </mesh>
        {/* Rear fork, forged from the same bar. */}
        <mesh geometry={geo.rearFork} castShadow>
          <Mat {...IRON} />
        </mesh>
        {/* Saddle clamp on the perch. */}
        <mesh position={[0, 0.69, -0.2]}>
          <boxGeometry args={[0.05, 0.05, 0.06]} />
          <Mat {...IRON} />
        </mesh>
      </Part>

      <Part id="saddle">
        <mesh geometry={geo.spring} castShadow>
          <Mat {...BRIGHT} />
        </mesh>
        <group position={[0, 0.95, -0.03]}>
          <mesh geometry={geo.saddle} castShadow>
            <Mat {...LEATHER} />
          </mesh>
        </group>
      </Part>

      <Part id="brake">
        <group ref={lever} position={PIVOT}>
          {/* Lever arm, hinged on the tail of the perch. */}
          <mesh position={[0, -0.02, -0.06]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[0.02, 0.012, 0.16]} />
            <Mat {...IRON} />
          </mesh>
          {/* The spoon itself, curved to the tyre. */}
          <mesh position={[0, -0.055, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.05, 12, 1, false, 0, Math.PI]} />
            <Mat {...BRIGHT} />
          </mesh>
          {/* Upper arm the cord pulls on. */}
          <mesh position={[0, 0.035, 0.01]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.02, 0.08, 0.012]} />
            <Mat {...IRON} />
          </mesh>
        </group>
        {/* Cord forward to the handlebar. */}
        <mesh geometry={geo.cord}>
          <Mat color="#6b5a3e" metalness={0.1} roughness={0.9} />
        </mesh>
      </Part>

      {/* ------------------------------------------------------------------ */}
      {/* Everything from here turns with the steering, about the raked axis. */}
      <group position={[0, AXLE_Y, frontZ]} rotation={[-rake, 0, 0]}>
        <group ref={steering}>
          <Part id="fork">
            <mesh geometry={geo.blades} castShadow>
              <Mat {...IRON} />
            </mesh>
            {/* Footrests for the descents. */}
            {sides.map((side) => (
              <mesh key={side} position={[side * 0.1, 0.13, 0.03]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.009, 0.009, 0.09, 8]} />
                <Mat {...BRIGHT} />
              </mesh>
            ))}
            {/* Steerer, up through the head. */}
            <mesh position={[0, (HEAD_LOW + BAR_S) / 2, 0]}>
              <cylinderGeometry args={[0.014, 0.014, BAR_S - HEAD_LOW, 12]} />
              <Mat {...IRON} />
            </mesh>
            <mesh position={[0, HEAD_LOW - 0.01, 0]}>
              <cylinderGeometry args={[0.032, 0.032, 0.02, 16]} />
              <Mat {...BRIGHT} />
            </mesh>
          </Part>

          <Part id="handlebar">
            <group ref={bar} position={[0, BAR_S, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.011, 0.011, 0.44, 12]} />
                <Mat {...IRON} />
              </mesh>
              {sides.map((side) => (
                <mesh key={side} position={[side * 0.27, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.017, 0.015, 0.11, 12]} />
                  <Mat {...WOOD} />
                </mesh>
              ))}
            </group>
          </Part>

          <Part id="frontwheel">
            <group ref={frontWheel}>
              <Wheel R={frontR} spokes={geo.front} />
            </group>
          </Part>

          <Part id="cranks">
            <group ref={cranks}>
              {sides.map((side) => (
                <group key={side} rotation={[side > 0 ? 0 : Math.PI, 0, 0]}>
                  {/* Crank arm, slotted for the pedal. */}
                  <mesh position={[side * 0.085, -crank / 2, 0]}>
                    <boxGeometry args={[0.012, crank + 0.03, 0.028]} />
                    <Mat {...IRON} />
                  </mesh>
                  {/* Pedal spindle and its weighted boss. */}
                  <mesh position={[side * 0.135, -crank, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.007, 0.007, 0.1, 8]} />
                    <Mat {...BRIGHT} />
                  </mesh>
                  <mesh position={[side * 0.14, -crank, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.022, 0.022, 0.07, 14]} />
                    <Mat {...BRASS} />
                  </mesh>
                </group>
              ))}
            </group>
          </Part>
        </group>
      </group>

      {/* ------------------------------------------------------------------ */}
      <Part id="rearwheel">
        <group ref={rearWheel} position={[0, rearR, rearZ]}>
          <Wheel R={rearR} spokes={geo.rear} />
        </group>
      </Part>
    </group>
  )
}

/** A carriage wheel: turned hub, radial wooden spokes, ash felloe, iron tyre. */
function Wheel({ R, spokes }: { R: number; spokes: THREE.BufferGeometry }) {
  return (
    <>
      <mesh geometry={spokes} castShadow>
        <Mat {...WOOD} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[R - 0.016, 0.016, 10, 56]} />
        <Mat {...WOOD} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[R - 0.006, 0.0125, 8, 56]} />
        <Mat {...TYRE} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.12, 16]} />
        <Mat {...WOOD} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.2, 8]} />
        <Mat {...BRIGHT} />
      </mesh>
    </>
  )
}
