import type { SimDef } from './types'
import { flyerSim } from './flyer'
import { p51Sim } from './p51'
import { t34Sim } from './t34'

/** One exercise per exhibit. */
export const sims: SimDef[] = [flyerSim, p51Sim, t34Sim]

export function getSim(slug?: string) {
  return sims.find((s) => s.slug === slug)
}
