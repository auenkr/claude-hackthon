import type { Controls, MachineSpec } from '../types'
import { flyer } from './flyer'
import { p51 } from './p51'
import { t34 } from './t34'

// Chronological: the collection reads as one argument about control.
export const machines: MachineSpec[] = [flyer, p51, t34]

export function getMachine(slug: string | undefined): MachineSpec | undefined {
  return machines.find((m) => m.slug === slug)
}

/** Initial control values for a machine, keyed by control id. */
export function defaultControls(machine: MachineSpec): Controls {
  return Object.fromEntries(machine.controls.map((c) => [c.id, c.value]))
}

export { flyer, p51, t34 }
