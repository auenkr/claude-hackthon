import type { MachineSpec, Source } from '../types'

const LALLEMENT: Source = {
  kind: 'text',
  citation: 'Lallement, P., US Patent 59,915, “Improvement in Velocipedes” (20 Nov 1866)',
  note: 'The first patent for a pedal-cranked two-wheeler: cranks on the front axle, a serpentine iron perch, and a saddle carried on a spring.',
}

const HERLIHY: Source = {
  kind: 'text',
  citation: 'Herlihy, D. V., Bicycle: The History (Yale, 2004), chs. 4–5',
  note: 'The standard account of the Michaux workshop, its output, and the 1868–69 velocipede craze.',
}

const CATALOGUE: Source = {
  kind: 'text',
  citation: 'Compagnie Parisienne des Vélocipèdes, catalogue and price list (Paris, 1869)',
  note: 'Successor to Michaux et Cie. Lists wheel sizes, options and prices for the standard machine.',
}

const SMG: Source = {
  kind: 'artifact',
  citation: 'Michaux-type velocipede, c. 1869, Science Museum Group collection, London',
  note: 'Wheel diameters, wheelbase, crank throw and frame section measured on the surviving machine.',
}

const INFER: Source = {
  kind: 'inference',
  citation: 'Reconstructed from the patent drawing and period photographs',
  note: 'Where no measured value survives, the dimension is derived from proportion against the known wheel diameter.',
}

export const velocipede: MachineSpec = {
  slug: 'velocipede',
  name: 'Velocipede',
  nativeName: 'Vélocipède Michaux',
  designation: 'Michaux et Cie, pedal velocipede — the “boneshaker”',
  origin: 'Paris, rue de Verneuil',
  years: '1867 — 1870',
  tagline: 'Two wheels, a pair of cranks, and the first machine a person could balance on.',
  accent: '#c9924a',
  camera: [2.4, 1.3, 2.6],
  target: [0, 0.55, 0],
  radius: 1.15,
  summary: [
    'Nobody had ridden a two-wheeler under their own power before the middle of the 1860s. The draisine of 1817 was pushed along with the feet; what the Michaux workshop sold from 1867 was a draisine with cranks bolted to the front axle, and that one change turned a curiosity into a craze. Within two years Paris had riding schools, races and a magazine.',
    'The machine is honest about being a blacksmith’s product. The perch is a single bar of wrought iron, forged into a serpentine curve so the rider can sit low between the wheels. The wheels are carriage-maker’s work — wooden spokes and felloes, shod with an iron tyre — and there is no freewheel: the pedals turn whenever the front wheel does. Going downhill, the rider lifted both feet onto rests on the fork and let the cranks spin.',
    'It weighs as much as a modern touring bicycle and a half, it has no suspension but a leaf spring under the saddle, and its only brake is a spoon of iron pressed onto the rear tyre by twisting the handlebar. The name the English gave it was accurate. But it balanced, and it steered, and everything after it is refinement.',
  ],
  facts: [
    { label: 'Weight', value: '≈ 27 kg' },
    { label: 'Front wheel', value: '36 in · 914 mm' },
    { label: 'Rear wheel', value: '32 in · 813 mm' },
    { label: 'Drive', value: 'Cranks on the front axle' },
    { label: 'Brake', value: 'Spoon on the rear tyre' },
    { label: 'Price, 1869', value: '250 francs' },
  ],
  controls: [
    {
      id: 'speed',
      label: 'Road speed',
      kind: 'slider',
      min: 0,
      max: 24,
      step: 1,
      value: 0,
      unit: 'km/h',
      hint: 'Direct drive: one turn of the pedals is one turn of the 36-inch wheel, 2.87 m of road. At 12 km/h the cadence is already 70 rpm.',
    },
    {
      id: 'steer',
      label: 'Steering',
      kind: 'slider',
      min: -40,
      max: 40,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'The fork is straight and the steering axis passes through the axle, so there is no trail — nothing pulls the wheel back to centre.',
    },
    {
      id: 'lean',
      label: 'Lean',
      kind: 'slider',
      min: -25,
      max: 25,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'A two-wheeler stays up by steering under its own fall. Below walking pace there is not enough speed for the steering to do it.',
    },
    {
      id: 'brake',
      label: 'Spoon brake',
      kind: 'toggle',
      value: 0,
      states: ['Off', 'On the tyre'],
      hint: 'Twisting the handlebar winds a cord that levers an iron spoon onto the rear tyre. Iron on iron, and the rear wheel carries little weight: it is barely a brake.',
    },
  ],
  parts: [
    {
      id: 'frame',
      name: 'Serpentine perch',
      group: 'Structure',
      blurb:
        'A single bar of wrought iron, hammer-forged into an S so the saddle sits low between two wheels of different size. The rear fork is forged from the same bar; the steering head is a plain iron socket at the front.',
      explode: [0, 0.55, 0],
      dimensions: [
        { label: 'Material', value: 'Wrought iron, forged', source: HERLIHY },
        { label: 'Section', value: '≈ 32 × 10 mm flat bar', source: SMG },
        { label: 'Wheelbase', value: '1.17 m', source: SMG },
        { label: 'Head angle', value: '≈ 70° from horizontal', source: INFER },
        { label: 'Machine weight', value: '≈ 27 kg', source: HERLIHY },
      ],
    },
    {
      id: 'frontwheel',
      name: 'Front wheel',
      group: 'Running gear',
      blurb:
        'Carriage-maker’s work: a turned wooden hub, radial wooden spokes let into a felloe of bent ash, and an iron tyre shrunk on hot. The bigger the wheel, the further each turn of the pedals carries you — which is the thought that led, within four years, to the high-wheeler.',
      explode: [0.8, 0, 0.35],
      dimensions: [
        { label: 'Diameter', value: '36 in · 914 mm', source: SMG },
        { label: 'Spokes', value: '12, wood, radial', source: SMG },
        { label: 'Tyre', value: 'Iron, ≈ 25 mm wide', source: CATALOGUE },
        { label: 'Road per turn', value: '2.87 m', source: INFER },
      ],
    },
    {
      id: 'rearwheel',
      name: 'Rear wheel',
      group: 'Running gear',
      blurb:
        'Four inches smaller than the front so the perch can drop behind the pedals. It carries the spoon brake, and rather less of the rider’s weight than the front wheel does.',
      explode: [0.8, 0, -0.35],
      dimensions: [
        { label: 'Diameter', value: '32 in · 813 mm', source: SMG },
        { label: 'Spokes', value: '12, wood, radial', source: SMG },
        { label: 'Tyre', value: 'Iron, ≈ 25 mm wide', source: CATALOGUE },
      ],
    },
    {
      id: 'cranks',
      name: 'Cranks and pedals',
      group: 'Drive',
      blurb:
        'The invention. Two iron cranks keyed to the front axle, with a slot so the pedal can be set nearer or further out to suit the rider’s leg. The pedals carry a small weight underneath so they hang the right way up. No chain, no gear, no freewheel.',
      explode: [0.55, -0.15, 0.6],
      dimensions: [
        { label: 'Throw', value: '5–6 in, adjustable in a slot', source: LALLEMENT },
        { label: 'Gear', value: '1 : 1 — direct on the front axle', source: LALLEMENT },
        { label: 'Pedal', value: 'Weighted brass boss, self-righting', source: CATALOGUE },
      ],
    },
    {
      id: 'fork',
      name: 'Fork and footrests',
      group: 'Steering',
      blurb:
        'Two straight iron blades from the steering head to the front axle. The rests bolted to the blades are for descents: with no freewheel the pedals spin faster than any leg can follow, so the rider lifts both feet and coasts.',
      explode: [0, -0.15, 0.55],
      dimensions: [
        { label: 'Blades', value: 'Straight, iron, no trail', source: SMG },
        { label: 'Footrests', value: 'Forward of the blades, one per side', source: CATALOGUE },
      ],
    },
    {
      id: 'handlebar',
      name: 'Handlebar',
      group: 'Steering',
      blurb:
        'A straight iron bar with turned wooden grips. It rotates in the head to steer and, separately, rolls about its own axis to work the brake cord — the same bar doing two jobs.',
      explode: [0, 0.6, 0.35],
      dimensions: [
        { label: 'Width', value: '≈ 0.55 m', source: SMG },
        { label: 'Grips', value: 'Turned wood', source: CATALOGUE },
      ],
    },
    {
      id: 'saddle',
      name: 'Saddle and spring',
      group: 'Structure',
      blurb:
        'A leather saddle carried on a long flat spring anchored at the rear of the perch. The spring is the machine’s entire suspension, and it can be slid along the perch to set the reach to the pedals.',
      explode: [0, 0.6, -0.1],
      dimensions: [
        { label: 'Saddle height', value: '≈ 0.95 m', source: INFER },
        { label: 'Spring', value: 'Single leaf, anchored at rear', source: LALLEMENT },
        { label: 'Adjustment', value: 'Slides on the perch', source: CATALOGUE },
      ],
    },
    {
      id: 'brake',
      name: 'Spoon brake',
      group: 'Drive',
      blurb:
        'An iron spoon on a lever above the rear wheel, pulled onto the tyre by a cord that winds around the handlebar when the bar is twisted. Iron on an iron tyre, on a wheel with little weight on it: it slows a descent, and not much else.',
      explode: [0, 0.4, -0.7],
      dimensions: [
        { label: 'Action', value: 'Cord to twisting handlebar', source: HERLIHY },
        { label: 'Contact', value: 'Iron spoon on iron tyre', source: SMG },
      ],
    },
  ],
  bibliography: [LALLEMENT, HERLIHY, CATALOGUE, SMG, INFER],
}
