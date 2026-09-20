import type { ControlSpec, Controls } from '../types'

/**
 * The visitor's hands. Pour the water, arm the gate, open the throttle —
 * every exhibit exposes the inputs its real operator had.
 */
export function ControlPanel({
  specs,
  values,
  accent,
  onChange,
  onReset,
}: {
  specs: ControlSpec[]
  values: Controls
  accent: string
  onChange: (id: string, value: number) => void
  onReset: () => void
}) {
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="placard text-label">Operate</h2>
        <button
          type="button"
          onClick={onReset}
          className="placard text-label transition-colors hover:text-ink"
        >
          Reset
        </button>
      </header>

      <div className="space-y-4">
        {specs.map((spec) => (
          <Control
            key={spec.id}
            spec={spec}
            value={values[spec.id] ?? spec.value}
            accent={accent}
            onChange={(v) => onChange(spec.id, v)}
          />
        ))}
      </div>
    </section>
  )
}

function Control({
  spec,
  value,
  accent,
  onChange,
}: {
  spec: ControlSpec
  value: number
  accent: string
  onChange: (value: number) => void
}) {
  if (spec.kind === 'toggle') {
    const on = value > 0.5
    const [offLabel, onLabel] = spec.states ?? ['Off', 'On']
    return (
      <div className="group">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-ink/90">{spec.label}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={spec.label}
            onClick={() => onChange(on ? 0 : 1)}
            className="relative h-[22px] w-[40px] shrink-0 rounded-full border border-rail transition-colors"
            style={{ background: on ? accent : 'transparent' }}
          >
            <span
              className="absolute top-[2px] h-[16px] w-[16px] rounded-full bg-ink transition-[left] duration-200"
              style={{ left: on ? 21 : 3 }}
            />
          </button>
        </div>
        <div className="mt-1 font-mono text-[11px] text-label">
          {on ? onLabel : offLabel}
        </div>
        {spec.hint && <Hint text={spec.hint} />}
      </div>
    )
  }

  const min = spec.min ?? 0
  const max = spec.max ?? 100
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`ctl-${spec.id}`} className="text-[13px] text-ink/90">
          {spec.label}
        </label>
        <span className="font-mono text-[12px] tabular-nums" style={{ color: accent }}>
          {value}
          {spec.unit ?? ''}
        </span>
      </div>
      <div className="relative mt-2">
        {/* Filled portion of the track, under the native input. */}
        <div className="pointer-events-none absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full" style={{ width: `${pct}%`, background: accent }} />
        <input
          id={`ctl-${spec.id}`}
          type="range"
          min={min}
          max={max}
          step={spec.step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative w-full"
        />
      </div>
      {spec.hint && <Hint text={spec.hint} />}
    </div>
  )
}

function Hint({ text }: { text: string }) {
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-label/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
      {text}
    </p>
  )
}
