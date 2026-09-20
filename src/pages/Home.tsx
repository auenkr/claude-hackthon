import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { ExhibitProvider } from '../three/Part'
import { Machine } from '../three/Machine'
import { defaultControls, machines } from '../data/machines'
import type { MachineSpec } from '../types'

/** How long each machine holds the light before the stage turns. */
const DWELL = 7000
const PIVOT = 9

export function Home() {
  const [active, setActive] = useState(() =>
    machines.findIndex((machine) => machine.slug === 't34-85'),
  )
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setActive((i) => (i + 1) % machines.length), DWELL)
    return () => clearTimeout(t)
  }, [active, paused])

  const machine = machines[active]

  return (
    <div className="min-h-full">
      {/* ---------------------------------------------------------------- */}
      <section className="vignette relative h-[86vh] min-h-[560px] w-full overflow-hidden">
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [0, 4.4, 15.5], fov: 34, near: 0.1, far: 220 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          <Suspense fallback={null}>
            <Stage active={active} onSelect={setActive} />
          </Suspense>
        </Canvas>

        {/* Wall text over the stage. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
          <header>
            <h1 className="font-display text-[34px] leading-none tracking-tight text-ink sm:text-[44px]">
              The Machine Archive
            </h1>
            <p className="placard mt-2 text-label">
              A museum of machines rebuilt from language and sketches
            </p>
          </header>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div key={machine.slug} className="rise max-w-md">
              <div className="placard mb-2" style={{ color: machine.accent }}>
                Now in the light · {machine.years}
              </div>
              <h2 className="font-display text-[28px] leading-tight text-ink sm:text-[34px]">
                {machine.name}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-label">
                {machine.tagline}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-5">
                <Link
                  to={`/machine/${machine.slug}`}
                  className="pointer-events-auto inline-flex items-center gap-2 border-b pb-1 text-[13px] text-ink transition-colors"
                  style={{ borderColor: machine.accent }}
                >
                  Enter the exhibit
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  to={`/machine/${machine.slug}/run`}
                  className="placard pointer-events-auto inline-flex items-center gap-2 rounded-sm px-3 py-2 transition-opacity hover:opacity-90"
                  style={{ background: machine.accent, color: '#17171b' }}
                >
                  Run it
                </Link>
              </div>
            </div>

            {/* Stage selector. */}
            <div
              className="pointer-events-auto flex gap-2"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              {machines.map((m, i) => (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Bring ${m.name} into the light`}
                  aria-current={i === active}
                  className="group flex flex-col items-start gap-2 p-1"
                >
                  <span
                    className="block h-px w-16 transition-all duration-500 sm:w-24"
                    style={{
                      background: i === active ? m.accent : 'var(--color-rail)',
                      height: i === active ? 2 : 1,
                    }}
                  />
                  <span
                    className="placard transition-colors"
                    style={{ color: i === active ? 'var(--color-ink)' : undefined }}
                  >
                    {m.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        <div className="placard mb-5 text-label">Why this exhibition exists</div>
        <p className="max-w-3xl font-display text-[22px] leading-[1.5] text-ink/85 sm:text-[28px]">
          History is full of machines we can describe, but can no longer watch.
        </p>
        <div className="mt-8 grid max-w-3xl gap-6 text-[14px] leading-[1.75] text-label sm:grid-cols-2">
          <p>
            A surviving machine may be a corroded artifact, a manuscript
            illustration, or only a few hundred characters of text. A
            motionless reconstruction behind glass is exactly the wrong way to
            encounter a mechanism. Every exhibit here is
            dimensioned from cited data and driven by its own geometry rather
            than by keyframed animation.
          </p>
          <p>
            Open a model, pull it apart piece by piece, zoom in on a single pivot, and
            select any component to see its dimensions and the source behind
            every value: a published text, a measured artifact, or a clearly
            labelled inference where we had to work it out ourselves.
          </p>
          <p>
            Then take the controls. Each exhibit has a simulation built from
            the same cited figures as its geometry — mass, area, power, gun
            limits — so what the machine will and will not do for you is a
            consequence of the sources rather than a judgement about
            difficulty. The Flyer really will only fly close to the sand. The
            T-34 really cannot turn while standing still.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <div className="placard mb-2 text-label">Exhibition dashboard</div>
            <h2 className="font-display text-[28px] text-ink sm:text-[34px]">The collection</h2>
          </div>
          <span className="font-mono text-[11px] text-label">{String(machines.length).padStart(2, '0')} active exhibits</span>
        </div>
        <ul className="border-t border-rail/60">
          {machines.map((m) => (
            <li
              key={m.slug}
              className="group relative grid gap-3 border-b border-rail/60 py-6 transition-colors hover:bg-gallery/55 sm:grid-cols-[110px_1fr_auto] sm:items-center sm:px-4"
            >
              <span
                className="font-mono text-[11px] tabular-nums"
                style={{ color: m.accent }}
              >
                {m.years}
              </span>
              <div>
                <Link
                  to={`/machine/${m.slug}`}
                  className="font-display text-[22px] text-ink after:absolute after:inset-0 after:content-['']"
                >
                  {m.name}
                </Link>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-label">{m.tagline}</p>
              </div>
              <span className="placard flex items-center gap-2 text-label transition-colors group-hover:text-ink">
                Open model <span aria-hidden="true">→</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-rail/60 px-6 py-10">
        <p className="mx-auto max-w-5xl text-[11px] leading-relaxed text-label/60">
          Every dimension in this museum is tagged with its origin. Where the
          sources are silent, the reconstruction says so.
        </p>
      </footer>
    </div>
  )
}

/**
 * The exhibition stage: the machines ride a turntable around a pivot set
 * behind the front of the room, so whichever one is chosen rolls into a
 * spotlight that never moves.
 */
function Stage({ active, onSelect }: { active: number; onSelect: (index: number) => void }) {
  const table = useRef<THREE.Group>(null)
  const spin = useRef(0)
  const { scene } = useThree()

  // A spotlight needs something to aim at, and the target has to live in
  // the graph for its world matrix to be kept up to date.
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    target.position.set(0, 0.8, 0)
    scene.add(target)
    return () => {
      scene.remove(target)
    }
  }, [scene, target])

  const step = (Math.PI * 2) / machines.length

  useFrame((_, dt) => {
    if (!table.current) return
    const goal = -active * step
    // Always turn the short way round.
    let delta = goal - spin.current
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    spin.current += delta * (1 - Math.exp(-1.6 * dt))
    table.current.rotation.y = spin.current
  })

  return (
    <>
      <color attach="background" args={['#eceae5']} />
      <fog attach="fog" args={['#eceae5', 16, 52]} />

      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#ffffff', '#ccc7bc', 0.9]} />

      {/* The fixed museum spotlight. Machines come to it. */}
      <spotLight
        position={[2.6, 11, 5.5]}
        target={target}
        angle={0.4}
        penumbra={0.9}
        intensity={300}
        distance={40}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0008}
      />
      <spotLight
        position={[-6, 7, 3]}
        target={target}
        angle={0.5}
        penumbra={1}
        intensity={80}
        color="#e8efff"
        distance={34}
      />
      <pointLight position={[0, 1.2, 7]} intensity={22} distance={16} color="#ffffff" />

      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.6} position={[0, 8, 3]} scale={[12, 8, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.3} position={[-8, 2, -6]} scale={[10, 6, 1]} rotation={[0, Math.PI / 3, 0]} color="#e4e9f2" />
      </Environment>

      {/* Gallery floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[40, 72]} />
        <meshStandardMaterial color="#e4e0d8" metalness={0.05} roughness={0.9} />
      </mesh>

      <group ref={table} position={[0, 0, -PIVOT]}>
        {machines.map((m, i) => (
          <StageMachine key={m.slug} machine={m} index={i} step={step} onSelect={onSelect} />
        ))}
      </group>
    </>
  )
}

function StageMachine({
  machine,
  index,
  step,
  onSelect,
}: {
  machine: MachineSpec
  index: number
  step: number
  onSelect: (index: number) => void
}) {
  const angle = index * step
  const controls = useMemo(() => {
    const base = defaultControls(machine)
    // On the stage the machines idle: engines turning, nothing stowed.
    if (machine.slug === 'velocipede') base.speed = 9
    if (machine.slug === 'p51-mustang') base.throttle = 55
    if (machine.slug === 'wright-flyer') base.engine = 60
    if (machine.slug === 't34-85') base.speed = 12
    if (machine.slug === 'lotus-49') base.throttle = 35
    return base
  }, [machine])

  const parts = useMemo(
    () => Object.fromEntries(machine.parts.map((p) => [p.id, p])),
    [machine],
  )

  // Scale every exhibit to a common display footprint, and stand it at a
  // three-quarter angle so the eye reads depth rather than a silhouette.
  // The velocipede's tall, narrow silhouette reads much larger than its
  // footprint, so it gets a smaller stage-only presentation scale.
  const scale = (4.4 / machine.radius) * (machine.slug === 'velocipede' ? 0.48 : 1)

  return (
    <group
      position={[Math.sin(angle) * PIVOT, 0, Math.cos(angle) * PIVOT]}
      rotation={[0, angle - 0.62, 0]}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(index)
      }}
      onPointerEnter={() => {
        document.body.style.cursor = 'pointer'
      }}
      onPointerLeave={() => {
        document.body.style.cursor = ''
      }}
    >
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
        <Machine machine={machine} controls={controls} />
      </ExhibitProvider>
    </group>
  )
}
