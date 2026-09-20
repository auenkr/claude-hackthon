import type { SimDef } from './types'
import { velocipedeSim } from './velocipede'
import { flyerSim } from './flyer'
import { lotus49Sim } from './lotus49'
import { p51Sim } from './p51'
import { t34Sim } from './t34'

/** One exercise per exhibit. */
export const sims: SimDef[] = [velocipedeSim, flyerSim, p51Sim, t34Sim, lotus49Sim]

export function getSim(slug?: string) {
  return sims.find((s) => s.slug === slug)
}
