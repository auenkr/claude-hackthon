import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { SimCanvas } from '../sim/SimCanvas'
import { SimHud } from '../components/SimHud'
import { SourceTag } from '../components/SourceTag'
import { Keyboard } from '../sim/keyboard'
import { getSim } from '../sim/sims'
import { getMachine } from '../data/machines'
import type { Sim, SimDef, ViewName } from '../sim/types'
import type { MachineSpec } from '../types'

export function SimPage() {
  const { slug } = useParams()
  const machine = getMachine(slug)
  const def = getSim(slug)
  if (!machine || !def) return <Navigate to="/" replace />
  // Keyed: walking to another machine's controls starts a fresh run.
  return <Run key={machine.slug} machine={machine} def={def} />
}

function Run({ machine, def }: { machine: MachineSpec; def: SimDef }) {
  const keys = useMemo(() => new Keyboard(), [])
  const sim = useMemo(() => def.create(), [def])

  const [view, setView] = useState<ViewName>(def.views[0].name)
  const [briefing, setBriefing] = useState(true)
  const [paused, setPaused] = useState(false)

  useEffect(() => keys.attach(), [keys])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'KeyP') setPaused((p) => !p)
      if (e.code === 'KeyR') sim.reset()
      if (e.code === 'KeyV') {
        setView((v) => {
          const i = def.views.findIndex((x) => x.name === v)
          return def.views[(i + 1) % def.views.length].name
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [def, sim])

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <SimCanvas
        machine={machine}
        sim={sim}
        view={view}
        paused={paused || briefing}
        keys={keys}
      />

      {/* Where you are, and the way out. */}
      <div className="pointer-events-none absolute left-0 top-0 p-4">
        <div className="pointer-events-auto inline-flex flex-col items-start gap-1 rounded border border-rail bg-gallery/90 px-3.5 py-2.5 backdrop-blur">
          <Link
            to={`/machine/${machine.slug}`}
            className="placard text-label transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span> {machine.name}
          </Link>
          <span className="text-[11px] text-label/80">{def.place}</span>
        </div>
      </div>

      <Panel
        sim={sim}
        def={def}
        accent={machine.accent}
        view={view}
        paused={paused}
        reticle={view === 'inside' && machine.slug === 't34-85'}
        onView={setView}
        machine={machine}
      />

      {briefing && (
        <Briefing
          def={def}
          machine={machine}
          onBegin={() => {
            setBriefing(false)
            setPaused(false)
          }}
        />
      )}
    </div>
  )
}

/**
 * The instruments. Kept in its own component with its own clock, so the
 * readings can refresh ten times a second without disturbing the scene.
 */
function Panel({
  sim,
  def,
  machine,
  accent,
  view,
  paused,
  reticle,
  onView,
}: {
  sim: Sim
  def: SimDef
  machine: MachineSpec
  accent: string
  view: ViewName
  paused: boolean
  reticle: boolean
  onView: (v: ViewName) => void
}) {
  const [readout, setReadout] = useState(() => sim.readout())

  useEffect(() => {
    const id = setInterval(() => setReadout(sim.readout()), 100)
    return () => clearInterval(id)
  }, [sim])

  return (
    <>
      <SimHud
        def={def}
        readout={readout}
        accent={accent}
        view={view}
        views={def.views}
        paused={paused}
        reticle={reticle}
        onView={onView}
      />

      {readout.verdict && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded border border-rail bg-gallery/95 p-6 backdrop-blur-md">
            <div className="placard mb-2" style={{ color: accent }}>
              {readout.verdict.good ? 'Run complete' : 'Run ended'}
            </div>
            <h2 className="font-display text-[26px] leading-tight text-ink">
              {readout.verdict.title}
            </h2>
            <ul className="mt-4 space-y-2">
              {readout.verdict.lines.map((line) => (
                <li key={line} className="text-[13px] leading-relaxed text-label">
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => sim.reset()}
                className="placard rounded-sm px-3 py-2 text-void"
                style={{ background: accent, color: '#17171b' }}
              >
                Run it again
              </button>
              <Link
                to={`/machine/${machine.slug}`}
                className="placard rounded-sm border border-rail px-3 py-2 text-label transition-colors hover:text-ink"
              >
                Back to the exhibit
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** The placard you read before you touch anything. */
function Briefing({
  def,
  machine,
  onBegin,
}: {
  def: SimDef
  machine: MachineSpec
  onBegin: () => void
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-void/85 p-6 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl rounded border border-rail bg-gallery p-6 sm:p-9">
        <div className="placard" style={{ color: machine.accent }}>
          {machine.name} · under your hands
        </div>
        <h1 className="mt-3 font-display text-[32px] leading-none text-ink sm:text-[40px]">
          {def.title}
        </h1>
        <p className="mt-2 text-[13px] text-label">{def.place}</p>

        <div className="mt-7 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            {def.briefing.map((para, i) => (
              <p key={i} className="text-[14px] leading-[1.75] text-ink/80">
                {para}
              </p>
            ))}

            <div className="border-t border-rail/70 pt-5">
              <h2 className="placard mb-3 text-label">Controls</h2>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {def.bindings.map((b) => (
                  <div key={b.keys} className="flex items-baseline gap-3">
                    <dt className="w-[74px] shrink-0 font-mono text-[11px] text-ink">
                      {b.keys}
                    </dt>
                    <dd className="text-[12px] leading-snug text-label">{b.action}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* The numbers the physics is made of, with their sources. */}
          <div className="lg:border-l lg:border-rail/70 lg:pl-8">
            <h2 className="placard mb-3 text-label">What the model is built from</h2>
            <p className="mb-4 text-[12px] leading-relaxed text-label">
              The simulation is not an animation. Mass, area, power and limits
              are the cited figures below; everything the machine does follows
              from them.
            </p>
            <dl className="space-y-3">
              {def.envelope.map((d) => (
                <div key={d.label}>
                  <dt className="placard text-[9px] text-label/80">{d.label}</dt>
                  <dd className="font-mono text-[12px] leading-snug text-ink">{d.value}</dd>
                  <div className="mt-1 flex items-start gap-2">
                    <SourceTag kind={d.source.kind} />
                    <span className="text-[10.5px] leading-relaxed text-label">
                      {d.source.citation}
                    </span>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-rail/70 pt-6">
          <button
            type="button"
            onClick={onBegin}
            className="placard rounded-sm px-4 py-2.5"
            style={{ background: machine.accent, color: '#17171b' }}
          >
            Take the controls
          </button>
          <Link
            to={`/machine/${machine.slug}`}
            className="placard rounded-sm border border-rail px-4 py-2.5 text-label transition-colors hover:text-ink"
          >
            Back to the exhibit
          </Link>
          <span className="text-[11px] text-label/80">{def.task}</span>
        </div>
      </div>
    </div>
  )
}
