import type { Source, SourceKind } from '../types'

const STYLES: Record<SourceKind, { label: string; className: string }> = {
  text: { label: 'Text', className: 'text-sky-800 border-sky-600/30 bg-sky-500/10' },
  artifact: {
    label: 'Artifact',
    className: 'text-emerald-800 border-emerald-700/30 bg-emerald-600/10',
  },
  inference: {
    label: 'Inference',
    className: 'text-amber-800 border-amber-700/30 bg-amber-500/15',
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
