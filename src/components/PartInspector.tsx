import { SourceLine } from './SourceTag'
import type { MachineSpec, PartSpec } from '../types'

/**
 * What you get when you select a component: what it is, what it measures,
 * and where every one of those numbers came from.
 */
export function PartInspector({
  part,
  machine,
  onClose,
}: {
  part: PartSpec | null
  machine: MachineSpec
  onClose: () => void
}) {
  if (!part) {
    return (
      <div className="rounded border border-rail/60 bg-plinth/60 p-4">
        <p className="text-[13px] leading-relaxed text-label">
          Select any component — in the model or in the catalogue — to read its
          dimensions and the source behind each one.
        </p>
      </div>
    )
  }

  return (
    <div className="rise rounded border border-rail/60 bg-plinth/60">
      <header
        className="flex items-start justify-between gap-3 border-b border-rail/60 p-4"
        style={{ borderLeft: `2px solid ${machine.accent}` }}
      >
        <div>
          <div className="placard mb-1 text-label">{part.group}</div>
          <h3 className="font-display text-[19px] leading-tight text-ink">{part.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear selection"
          className="-m-1 shrink-0 p-1 text-label transition-colors hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </header>

      <p className="border-b border-rail/40 p-4 text-[13px] leading-relaxed text-ink/75">
        {part.blurb}
      </p>

      <dl className="divide-y divide-rail/30">
        {part.dimensions.map((dim) => (
          <div key={dim.label} className="p-4">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-label">{dim.label}</dt>
              <dd className="text-right font-mono text-[13px] text-ink">{dim.value}</dd>
            </div>
            <SourceLine source={dim.source} />
            {dim.source.note && (
              <p className="mt-1.5 border-l border-rail pl-2.5 text-[11px] leading-relaxed text-label/70">
                {dim.source.note}
              </p>
            )}
          </div>
        ))}
      </dl>
    </div>
  )
}
