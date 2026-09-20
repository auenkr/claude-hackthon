/** Where a number came from. Every dimension in the museum carries one. */
export type SourceKind = 'text' | 'artifact' | 'inference'

export interface Source {
  kind: SourceKind
  /** Short citation shown under the value. */
  citation: string
  /** Optional expansion: what exactly the source says. */
  note?: string
}

export interface Dimension {
  label: string
  value: string
  source: Source
}

export interface PartSpec {
  id: string
  name: string
  /** Assembly the part belongs to, e.g. 'Powerplant'. */
  group: string
  blurb: string
  dimensions: Dimension[]
  /**
   * Direction and distance (metres) the part travels at full explode.
   * Pulling a machine apart is the whole point, so every part declares one.
   */
  explode: [number, number, number]
}

export type ControlKind = 'slider' | 'toggle'

export interface ControlSpec {
  id: string
  label: string
  kind: ControlKind
  min?: number
  max?: number
  step?: number
  value: number
  unit?: string
  /** One line explaining what the real mechanism does. */
  hint?: string
  /** Labels for a toggle's two states, off then on. */
  states?: [string, string]
}

export interface MachineSpec {
  slug: string
  name: string
  nativeName?: string
  designation: string
  origin: string
  years: string
  tagline: string
  /** Two or three paragraphs of wall text. */
  summary: string[]
  facts: { label: string; value: string }[]
  parts: PartSpec[]
  controls: ControlSpec[]
  bibliography: Source[]
  /** Hex accent used for the exhibit's lighting and UI highlights. */
  accent: string
  /** Default orbit camera position and target, in metres. */
  camera: [number, number, number]
  target: [number, number, number]
  /** Radius used to frame the machine on the home turntable. */
  radius: number
}

/** Live values for a machine's controls, keyed by control id. */
export type Controls = Record<string, number>

/**
 * Where a reconstruction is standing. On the `plinth` it poses itself — the
 * aeroplane sits on its gear, the Flyer lifts a little when you throw the
 * launch switch. Set `free` and it renders in its own body axes with the
 * origin untouched, so a simulator can own the attitude instead.
 */
export type Mount = 'plinth' | 'free'
