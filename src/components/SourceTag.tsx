import type { Source, SourceKind } from '../types'

const STYLES: Record<SourceKind, { label: string; className: string }> = {
  text: { label: 'Text', className: 'text-sky-300/90 border-sky-400/30 bg-sky-400/10' },
  artifact: {
    label: 'Artifact',
    className: 'text-emerald-300/90 border-emerald-400/30 bg-emerald-400/10',
  },
  inference: {
    label: 'Inference',
    className: 'text-amber-300/90 border-amber-400/30 bg-amber-400/10',
  },
}

/**
 * The museum's honesty marker. Every number is either read from a source or
 * worked out by us, and the visitor is always told which.
 */
export function SourceTag({ kind }: { kind: SourceKind }) {
  const s = STYLES[kind]
  return (
    <span
      className={`placard shrink-0 rounded-sm border px-1.5 py-0.5 leading-none ${s.className}`}
    >
      {s.label}
    </span>
  )
}

export function SourceLine({ source }: { source: Source }) {
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <SourceTag kind={source.kind} />
      <p className="text-[11px] leading-relaxed text-label">{source.citation}</p>
    </div>
  )
}
