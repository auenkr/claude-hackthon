import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Exhibit } from '../three/Exhibit'
import { ControlPanel } from '../components/ControlPanel'
import { PartInspector } from '../components/PartInspector'
import { PartList } from '../components/PartList'
import { SourceTag } from '../components/SourceTag'
import { defaultControls, getMachine, machines } from '../data/machines'
import { getSim } from '../sim/sims'
import type { Controls, MachineSpec } from '../types'

export function MachinePage() {
  const { slug } = useParams()
  const machine = getMachine(slug)
  if (!machine) return <Navigate to="/" replace />
  // Keyed by slug: walking to the next exhibit resets the bench, with no
  // effect needed to tear the old state down.
  return <Exhibition key={machine.slug} machine={machine} />
}

function Exhibition({ machine }: { machine: MachineSpec }) {
  const [controls, setControls] = useState<Controls>(() => defaultControls(machine))
  const [selected, setSelected] = useState<string | null>(null)
  const [explode, setExplode] = useState(0)
  const [xray, setXray] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)

  const selectedPart = useMemo(
    () => machine.parts.find((p) => p.id === selected) ?? null,
    [machine, selected],
  )

  const index = machines.indexOf(machine)
  const next = machines[(index + 1) % machines.length]

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ---------------------------------------------------------------- */}
      <aside className="flex w-full shrink-0 flex-col border-rail/60 lg:h-full lg:w-[340px] lg:border-r">
        <div className="border-b border-rail/60 p-5">
          <Link
            to="/"
            className="placard inline-flex items-center gap-1.5 text-label transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span> The Machine Archive
          </Link>
          <h1 className="mt-4 font-display text-[30px] leading-[1.05] text-ink">
            {machine.name}
          </h1>
          {machine.nativeName && (
            <div className="mt-1 font-display text-[19px] text-label">
              {machine.nativeName}
            </div>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-label">
            {machine.designation}
            <br />
            {machine.origin} · {machine.years}
          </p>

          {/* The exhibit explains the machine; this is where you work it.
              Only offered once an exercise exists for the machine. */}
          {getSim(machine.slug) && (
            <Link
              to={`/machine/${machine.slug}/run`}
              className="mt-4 inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[12px] transition-opacity hover:opacity-90"
              style={{ background: machine.accent, color: '#17171b' }}
            >
              <span className="placard">Take the controls</span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          {machine.summary.map((para, i) => (
            <p key={i} className="text-[13.5px] leading-[1.7] text-ink/75">
              {para}
            </p>
          ))}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rail/60 pt-5">
            {machine.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="placard mb-1 text-label/70">{fact.label}</dt>
                <dd className="font-mono text-[12px] leading-snug text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <div className="border-t border-rail/60 pt-5">
            <h2 className="placard mb-3 text-label">Sources</h2>
            <ul className="space-y-2.5">
              {machine.bibliography.map((source) => (
                <li key={source.citation} className="flex items-start gap-2">
                  <SourceTag kind={source.kind} />
                  <span className="text-[11px] leading-relaxed text-label">
                    {source.citation}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      <main className="vignette relative min-h-[55vh] flex-1 lg:h-full">
        <Exhibit
          machine={machine}
          controls={controls}
          selected={selected}
          onSelect={setSelected}
          explode={explode}
          xray={xray}
          autoRotate={autoRotate}
        />

        {/* View controls, floating over the case. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <div className="pointer-events-auto mx-auto flex max-w-2xl flex-wrap items-center gap-x-6 gap-y-3 rounded border border-rail/70 bg-gallery/85 px-4 py-3 backdrop-blur-md">
            <div className="flex min-w-[190px] flex-1 items-center gap-3">
              <label htmlFor="explode" className="placard shrink-0 text-label">
                Exploded
              </label>
              <input
                id="explode"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explode}
                onChange={(e) => setExplode(Number(e.target.value))}
                className="w-full"
              />
              <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-label">
                {Math.round(explode * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Toggle on={xray} onClick={() => setXray(!xray)} accent={machine.accent}>
                X-ray
              </Toggle>
              <Toggle
                on={autoRotate}
                onClick={() => setAutoRotate(!autoRotate)}
                accent={machine.accent}
              >
                Turntable
              </Toggle>
            </div>
          </div>
        </div>

        <div className="placard pointer-events-none absolute left-0 top-0 p-5 text-label/60">
          Drag to orbit · scroll to zoom · click a part
        </div>
      </main>

      {/* ---------------------------------------------------------------- */}
      <aside className="flex w-full shrink-0 flex-col border-rail/60 lg:h-full lg:w-[330px] lg:border-l">
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-5">
          <PartInspector
            part={selectedPart}
            machine={machine}
            onClose={() => setSelected(null)}
          />
          <ControlPanel
            specs={machine.controls}
            values={controls}
            accent={machine.accent}
            onChange={(id, value) => setControls((c) => ({ ...c, [id]: value }))}
            onReset={() => setControls(defaultControls(machine))}
          />
          <PartList machine={machine} selected={selected} onSelect={setSelected} />
        </div>

        <Link
          to={`/machine/${next.slug}`}
          className="group flex shrink-0 items-center justify-between border-t border-rail/60 p-5 transition-colors hover:bg-case/50"
        >
          <div>
            <div className="placard mb-1 text-label">Next exhibit</div>
            <div className="font-display text-[16px] text-ink">{next.name}</div>
          </div>
          <span
            className="text-label transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          >
            →
          </span>
        </Link>
      </aside>
    </div>
  )
}

function Toggle({
  on,
  onClick,
  accent,
  children,
}: {
  on: boolean
  onClick: () => void
  accent: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="placard rounded-sm border px-2.5 py-1.5 transition-colors"
      style={{
        color: on ? '#17171b' : undefined,
        background: on ? accent : 'transparent',
        borderColor: on ? accent : 'var(--color-rail)',
      }}
    >
      {children}
    </button>
  )
}
