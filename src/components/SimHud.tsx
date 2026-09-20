import type { Gauge, Readout, SimDef } from '../sim/types'
import { Graticule } from './Graticule'

/**
 * The operator's panel. Deliberately instrument-like: readings in mono,
 * labels as wall placards, and everything the machine is telling you kept in
 * one place rather than floating over the machine itself.
 */
export function SimHud({
  def,
  readout,
  accent,
  paused,
  reticle,
}: {
  def: SimDef
  readout: Readout
  accent: string
  paused: boolean
  /** Draw a gunner's graticule over the middle of the picture. */
  reticle: boolean
}) {
  return (
    <>
      {reticle && <Graticule />}

      {/* Task and progress, across the top. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
        <div className="pointer-events-auto w-full max-w-xl rounded border border-rail bg-gallery/90 px-4 py-2.5 backdrop-blur">
          <div className="flex items-baseline justify-between gap-4">
            <span className="placard text-label">{def.title}</span>
            <span className="font-mono text-[11px] text-label">
              {Math.round(readout.progress * 100)}%
            </span>
          </div>
          <div className="mt-1.5 text-[13px] leading-snug text-ink">{readout.task}</div>
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-rail">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${readout.progress * 100}%`, background: accent }}
            />
          </div>
        </div>
      </div>

      {/* Instruments. */}
      <div className="pointer-events-none absolute bottom-0 left-0 p-4">
        <div className="pointer-events-auto max-w-[340px] rounded border border-rail bg-gallery/90 p-3.5 backdrop-blur">
          <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
            {readout.gauges.map((g) => (
              <Reading key={g.label} gauge={g} accent={accent} />
            ))}
          </div>
          <p className="mt-3 border-t border-rail/70 pt-2.5 text-[12px] leading-snug text-label">
            {readout.status}
          </p>
        </div>
      </div>

      {/* Running commentary. */}
      <div className="pointer-events-none absolute bottom-0 right-0 flex flex-col items-end gap-2 p-4">
        <ul className="max-w-[300px] space-y-1 text-right">
          {readout.log.map((line, i) => (
            <li
              key={`${i}-${line}`}
              className="text-[11.5px] leading-snug text-label"
              style={{ opacity: 0.35 + (0.65 * (i + 1)) / readout.log.length }}
            >
              {line}
            </li>
          ))}
        </ul>
      </div>

      {paused && !readout.verdict && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="placard rounded border border-rail bg-gallery/90 px-4 py-2.5 text-label backdrop-blur">
            Paused · P to carry on
          </div>
        </div>
      )}
    </>
  )
}

function Reading({ gauge, accent }: { gauge: Gauge; accent: string }) {
  return (
    <div>
      <div className="placard mb-0.5 truncate text-[9px] text-label/80">{gauge.label}</div>
      <div
        className="font-mono text-[13px] leading-none tabular-nums"
        style={{ color: gauge.warn ? accent : undefined }}
      >
        {gauge.value}
        {gauge.unit && <span className="ml-0.5 text-[9px] text-label">{gauge.unit}</span>}
      </div>
      {gauge.bar !== undefined && (
        <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-rail">
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(1, gauge.bar)) * 100}%`,
              background: gauge.warn ? accent : 'var(--color-label)',
            }}
          />
        </div>
      )}
    </div>
  )
}
