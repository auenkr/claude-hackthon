import { Flyer } from './Flyer'
import { P51 } from './P51'
import { T34 } from './T34'
import type { Controls, MachineSpec, Mount } from '../types'

/** Dispatch to the right reconstruction. One entry per exhibit. */
export function Machine({
  machine,
  controls,
  mount = 'plinth',
}: {
  machine: MachineSpec
  controls: Controls
  mount?: Mount
}) {
  switch (machine.slug) {
    case 'wright-flyer':
      return <Flyer controls={controls} mount={mount} />
    case 'p51-mustang':
      return <P51 controls={controls} mount={mount} />
    case 't34-85':
      return <T34 controls={controls} />
    default:
      return null
  }
}
