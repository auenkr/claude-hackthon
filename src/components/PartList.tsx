import { useMemo } from 'react'
import type { MachineSpec } from '../types'

/** The catalogue, grouped by assembly. Selecting here selects in the scene. */
export function PartList({
  machine,
  selected,
  onSelect,
}: {
  machine: MachineSpec
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, MachineSpec['parts']>()
    for (const part of machine.parts) {
      const list = map.get(part.group) ?? []
      list.push(part)
      map.set(part.group, list)
    }
    return [...map.entries()]
  }, [machine])

  return (
    <section>
      <h2 className="placard mb-3 text-label">
        Catalogue · {machine.parts.length} parts
      </h2>
      <div className="space-y-4">
        {groups.map(([group, parts]) => (
          <div key={group}>
            <div className="mb-1.5 text-[11px] tracking-wide text-label/60">{group}</div>
            <ul className="space-y-px">
              {parts.map((part) => {
                const active = selected === part.id
                return (
                  <li key={part.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(active ? null : part.id)}
                      className={`group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] transition-colors ${
                        active ? 'bg-case text-ink' : 'text-ink/70 hover:bg-case/60 hover:text-ink'
                      }`}
                    >
                      <span
                        className="h-3 w-px shrink-0 transition-colors"
                        style={{ background: active ? machine.accent : 'transparent' }}
                      />
                      {part.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
