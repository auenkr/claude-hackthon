import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ExhibitProvider } from '../three/Part'
import { Machine } from '../three/Machine'
import { Dunes } from './scenes/Dunes'
import { Airfield } from './scenes/Airfield'
import { Range } from './scenes/Range'
import { Boulevard } from './scenes'
import type { Keyboard } from './keyboard'
import type { Sim, ViewName } from './types'
import type { VelocipedeSim } from './velocipede'
import type { FlyerSim } from './flyer'
import type { P51Sim } from './p51'
import type { T34Sim } from './t34'
import type { Controls, MachineSpec } from '../types'

/**
 * The machine, running.
 *
 * Nothing about the reconstruction changes: it is the same geometry from the
 * same cited dimensions, mounted `free` so the simulation owns its attitude
 * and driving the same controls a visitor would move by hand.
 */
export function SimCanvas({
  machine,
  sim,
  view,
  paused,
  keys,
}: {
  machine: MachineSpec
  sim: Sim
  view: ViewName
  paused: boolean
  keys: Keyboard
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 6, -20], fov: 45, near: 0.22, far: 14000 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        logarithmicDepthBuffer: true,
      }}
    >
      <Suspense fallback={null}>
        {machine.slug === 'velocipede' && <Boulevard sim={sim as VelocipedeSim} />}
        {machine.slug === 'wright-flyer' && (
          <Dunes sim={sim as FlyerSim} accent={machine.accent} />
        )}
        {machine.slug === 'p51-mustang' && (
          <Airfield sim={sim as P51Sim} accent={machine.accent} />
        )}
        {machine.slug === 't34-85' && <Range sim={sim as T34Sim} />}

        <Rig machine={machine} sim={sim} view={view} paused={paused} keys={keys} />
      </Suspense>
    </Canvas>
  )
}

const WORLD_UP = new THREE.Vector3(0, 1, 0)

function Rig({
  machine,
  sim,
  view,
  paused,
  keys,
}: {
  machine: MachineSpec
  sim: Sim
  view: ViewName
  paused: boolean
  keys: Keyboard
}) {
  const group = useRef<THREE.Group>(null)

  // Control values are pushed into the reconstruction in whole units — the
  // same steps the exhibit's own sliders move in — so React only re-renders
  // the machine when something has actually changed.
  const [controls, setControls] = useState<Controls>(() => ({ ...sim.controls() }))
  const last = useRef<Controls>(controls)

  const eye = useRef(new THREE.Vector3())
  const aim = useRef(new THREE.Vector3())
  const lookAt = useRef(new THREE.Vector3())
  const up = useRef(new THREE.Vector3(0, 1, 0))
  const placed = useRef(false)

  const parts = useMemo(
    () => Object.fromEntries(machine.parts.map((p) => [p.id, p])),
    [machine],
  )

  useFrame((state, delta) => {
    // A long frame must not let anything tunnel through the ground.
    const dt = Math.min(0.04, delta)
    if (!paused) sim.step(dt, keys)
    keys.endFrame()

    if (group.current) {
      group.current.position.copy(sim.position)
      group.current.quaternion.copy(sim.quaternion)
      // A destroyed machine leaves the scene: what is burning there is no
      // longer a reconstruction of anything.
      group.current.visible = sim.showModel !== false
    }

    const fov = sim.camera(view, eye.current, aim.current)
    const cam = state.camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    if (!placed.current) {
      cam.position.copy(eye.current)
      lookAt.current.copy(aim.current)
      placed.current = true
    }
    const snap = view === 'inside'
    cam.position.lerp(eye.current, snap ? 1 : 1 - Math.exp(-7 * dt))
    lookAt.current.lerp(aim.current, snap ? 1 : 1 - Math.exp(-9 * dt))

    // The horizon tilts with the machine from inside, and part way from
    // astern — flying a warping biplane with a level horizon reads as a lie.
    up.current.set(0, 1, 0).applyQuaternion(sim.quaternion)
    if (view === 'tower') cam.up.copy(WORLD_UP)
    else if (snap) cam.up.copy(up.current)
    else cam.up.copy(WORLD_UP).lerp(up.current, 0.55).normalize()
    cam.lookAt(lookAt.current)

    const live = sim.controls()
    let next: Controls | null = null
    for (const key in live) {
      const q = Math.round(live[key])
      if (last.current[key] !== q) {
        next = next ?? { ...last.current }
        next[key] = q
      }
    }
    if (next) {
      last.current = next
      setControls(next)
    }
  })

  return (
    <group ref={group}>
      <ExhibitProvider
        value={{
          selected: null,
          hovered: null,
          explode: 0,
          xray: false,
          accent: machine.accent,
          parts,
          select: () => {},
          hover: () => {},
        }}
      >
        <Machine machine={machine} controls={controls} mount="free" />
      </ExhibitProvider>
    </group>
  )
}
