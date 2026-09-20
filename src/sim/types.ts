import type * as THREE from 'three'
import type { Controls, Dimension } from '../types'
import type { Keyboard } from './keyboard'

/** One instrument on the panel. */
export interface Gauge {
  label: string
  value: string
  unit?: string
  /** 0–1, drawn as a bar under the reading. */
  bar?: number
  /** Out of limits: shown in the exhibit accent. */
  warn?: boolean
}

/** How the run ended. */
export interface Verdict {
  title: string
  lines: string[]
  good: boolean
}

/** Everything the panel shows, rebuilt a few times a second. */
export interface Readout {
  gauges: Gauge[]
  /** What the machine is doing, in one line. */
  status: string
  /** The current task, which may change as the run progresses. */
  task: string
  /** Progress through the exercise, 0–1. */
  progress: number
  /** Most recent events, newest last. */
  log: string[]
  verdict?: Verdict
}

/** Camera positions the visitor can cycle through. */
export type ViewName = 'chase' | 'inside' | 'tower'

export interface View {
  name: ViewName
  label: string
}

/**
 * A running machine. The instance is mutable and lives in a ref: `step` is
 * called from the render loop, and the React side only reads `readout()`.
 */
export interface Sim {
  /** World position of the model's datum, in metres. */
  readonly position: THREE.Vector3
  /** Body orientation, applied to the model group as-is. */
  readonly quaternion: THREE.Quaternion

  /** Advance the physics. `dt` is already clamped. */
  step(dt: number, keys: Keyboard): void
  /** Control values for the reconstruction, as the panel sliders would set. */
  controls(): Controls
  readout(): Readout
  reset(): void

  /** Eye point and aim for a view, in world space. */
  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3): number
  /** True once the run is over and the verdict stands. */
  readonly finished: boolean
}

/** The wall text for a simulation: what it is, and where the numbers came from. */
export interface SimDef {
  slug: string
  /** Title of the exercise, e.g. 'Kill Devil Hills, 17 December 1903'. */
  title: string
  place: string
  briefing: string[]
  task: string
  views: View[]
  bindings: { keys: string; action: string }[]
  /** The cited figures the physics is actually built from. */
  envelope: Dimension[]
  create(): Sim
}
