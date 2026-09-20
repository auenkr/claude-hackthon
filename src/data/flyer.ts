import type { MachineSpec, Source } from '../types'

const PATENT: Source = {
  kind: 'text',
  citation: 'Wright, O. & W., US Patent 821,393, “Flying Machine” (filed 1903, granted 1906)',
  note: 'The Wrights’ own account of the control system. The claims are written around warping, not around the engine — they knew where the invention was.',
}

const PAPERS: Source = {
  kind: 'text',
  citation: 'McFarland, M. (ed.), The Papers of Wilbur and Orville Wright (McGraw-Hill, 1953)',
  note: 'Notebooks, diaries and letters, including the 1903 flight log and the brothers’ own propeller calculations.',
}

const NASM: Source = {
  kind: 'artifact',
  citation: 'NASM A19480041 — 1903 Wright Flyer, Smithsonian survey',
  note: 'The surviving machine itself, rebuilt by Orville in 1927 and measured repeatedly since.',
}

const JAKAB: Source = {
  kind: 'text',
  citation: 'Jakab, P., Visions of a Flying Machine (Smithsonian, 1990)',
  note: 'Engineering reconstruction of the Wrights’ design process from wind-tunnel data through to the 1903 machine.',
}

const INFER: Source = {
  kind: 'inference',
  citation: 'Reconstructed from period photographs against the measured airframe',
  note: 'Rigging wires and fitting positions are inferred from the December 1903 photographs; spans and chords are measured.',
}

export const flyer: MachineSpec = {
  slug: 'wright-flyer',
  name: 'Wright Flyer',
  designation: 'Kitty Hawk, 17 December 1903',
  origin: 'Dayton, Ohio · flown at Kill Devil Hills',
  years: '1903',
  tagline: 'The first machine to fly, and the first to be steered.',
  accent: '#c9a26b',
  camera: [11, 4.5, 11],
  target: [0, 1.4, 0],
  radius: 6.6,
  summary: [
    'Powered flight was not the hard part. Steam and petrol engines had been lifting models off the ground for years, and several men had built full-size machines that left the ground briefly before crashing. What nobody had was control.',
    'The Wrights solved it by noticing what a buzzard does with its wingtips. Twisting one end of the wing up and the other down makes one side lift harder than the other, and the machine rolls. Their first attempts at this produced a vicious yaw the wrong way — so they hinged the rear rudder and wired it to the same hip cradle that pulls the warping. One movement of the pilot’s hips does both. Move the cradle in this exhibit and watch the rudder follow.',
    'The engine was almost an afterthought, built in six weeks by their shop mechanic Charlie Taylor because no manufacturer would supply one light enough. Twelve horsepower, an aluminium crankcase, no carburettor and no fuel pump. The propellers mattered far more: the brothers worked out that a propeller is a rotating wing, not a screw, and carved a pair that reached an efficiency nobody else came close to for years.',
  ],
  facts: [
    { label: 'Wingspan', value: '12.29 m · 40 ft 4 in' },
    { label: 'Wing area', value: '47.4 m² · 510 ft²' },
    { label: 'Powerplant', value: 'Wright/Taylor inline four, 12 hp' },
    { label: 'Gross weight', value: '338 kg with pilot' },
    { label: 'First flight', value: '12 seconds, 36.5 m' },
    { label: 'Best of the day', value: '59 seconds, 260 m' },
  ],
  controls: [
    {
      id: 'engine',
      label: 'Engine',
      kind: 'slider',
      min: 0,
      max: 100,
      step: 1,
      value: 0,
      unit: '%',
      hint: 'Chain drive geared 23:8, so 1,025 crankshaft rpm turns the propellers at about 350.',
    },
    {
      id: 'cradle',
      label: 'Hip cradle',
      kind: 'slider',
      min: -100,
      max: 100,
      step: 1,
      value: 0,
      unit: '%',
      hint: 'The heart of the patent. Sliding the cradle warps the wings and swings the rudder together — one input, two surfaces.',
    },
    {
      id: 'elevator',
      label: 'Forward elevator',
      kind: 'slider',
      min: -20,
      max: 20,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'Worked by a hand lever. Placed ahead of the wings, where the Wrights believed it would cushion a nose-down dive.',
    },
    {
      id: 'airborne',
      label: 'Launch rail',
      kind: 'toggle',
      value: 0,
      states: ['On the rail', 'Airborne'],
      hint: 'There was no undercarriage. The machine ran along 18 m of two-by-four on a small wheeled truck and left it at flying speed.',
    },
  ],
  parts: [
    {
      id: 'upper-wing',
      name: 'Upper wing',
      group: 'Wings',
      blurb:
        'Spruce spars, ash ribs, and unvarnished muslin sewn on the bias so the fabric itself braces the structure diagonally. The section is thin and deeply cambered at one in twenty — a curve the Wrights arrived at in their own wind tunnel after Lilienthal’s published tables led them astray.',
      explode: [0, 2.2, 0],
      dimensions: [
        { label: 'Span', value: '12.29 m · 40 ft 4 in', source: NASM },
        { label: 'Chord', value: '1.98 m · 6 ft 6 in', source: NASM },
        { label: 'Camber', value: '1 in 20', source: PAPERS },
        { label: 'Covering', value: 'Pride of the West muslin, bias-sewn', source: JAKAB },
        { label: 'Anhedral', value: 'Tips rigged low, for gust stability', source: INFER },
      ],
    },
    {
      id: 'lower-wing',
      name: 'Lower wing',
      group: 'Wings',
      blurb:
        'Carries the engine to starboard and the pilot to port, lying prone. The weights balance either side of the centreline, which is why the pilot flew on his belly rather than sitting up in the wind.',
      explode: [0, -1.6, 0],
      dimensions: [
        { label: 'Span', value: '12.29 m', source: NASM },
        { label: 'Gap to upper wing', value: '1.88 m · 6 ft 2 in', source: NASM },
        { label: 'Total wing area', value: '47.4 m² · 510 ft²', source: PAPERS },
      ],
    },
    {
      id: 'struts',
      name: 'Struts and rigging',
      group: 'Structure',
      blurb:
        'Spruce uprights dividing the wings into bays, cross-braced with steel wire. The rigging is deliberately incomplete in one direction: leaving the outer bays free to flex is what lets the wing warp at all.',
      explode: [0, 0.9, 0],
      dimensions: [
        { label: 'Uprights', value: '12, in six bays a side', source: INFER },
        { label: 'Bracing', value: 'Crossed steel wire, fore and aft', source: NASM },
        { label: 'Materials', value: 'Spruce, ash for bent members', source: JAKAB },
      ],
    },
    {
      id: 'canard',
      name: 'Forward elevator',
      group: 'Control',
      blurb:
        'A biplane elevator carried out front on spruce outriggers. Putting it ahead of the wing made the machine pitch-sensitive to the point of being exhausting to fly, and the Wrights moved it aft within a few years.',
      explode: [0, 0.4, 2.6],
      dimensions: [
        { label: 'Span', value: '3.66 m · 12 ft', source: NASM },
        { label: 'Area', value: '4.5 m² · 48 ft², both surfaces', source: PAPERS },
        { label: 'Control', value: 'Hand lever, left hand', source: PATENT },
      ],
    },
    {
      id: 'rudder',
      name: 'Rear rudder',
      group: 'Control',
      blurb:
        'Twin fixed vanes at first, which made the warping problem worse. Hinging them and wiring them to the hip cradle is the change that turned a glider that occasionally spun into an aircraft that could be steered.',
      explode: [0, 0.4, -2.6],
      dimensions: [
        { label: 'Height', value: '1.83 m · 6 ft', source: NASM },
        { label: 'Area', value: '1.95 m² · 21 ft², both vanes', source: PAPERS },
        { label: 'Linkage', value: 'Wired to the hip cradle', source: PATENT },
      ],
    },
    {
      id: 'cradle',
      name: 'Hip cradle',
      group: 'Control',
      blurb:
        'A padded wooden saddle on runners. The pilot lies in it and shifts his hips; wires from the cradle warp the wingtips and pull the rudder at the same time, in the proportion the linkage sets.',
      explode: [-1.4, 0.3, 0],
      dimensions: [
        { label: 'Pilot position', value: 'Prone, port of centreline', source: NASM },
        { label: 'Actuates', value: 'Wing warp and rudder together', source: PATENT },
        { label: 'Travel', value: 'Roughly 100 mm either side', source: INFER },
      ],
    },
    {
      id: 'engine',
      name: 'Wright–Taylor engine',
      group: 'Powerplant',
      blurb:
        'Four cylinders lying on their side in an aluminium crankcase, built in the bicycle shop in six weeks. No carburettor — fuel dripped into the intake manifold by gravity — no spark plugs, and no throttle worth the name.',
      explode: [1.6, 1.4, 0.6],
      dimensions: [
        { label: 'Configuration', value: 'Inline four, horizontal, water-cooled', source: JAKAB },
        { label: 'Displacement', value: '3.29 L · 201 in³', source: JAKAB },
        { label: 'Power', value: '≈12 hp at 1,025 rpm', source: PAPERS },
        { label: 'Crankcase', value: 'Cast aluminium alloy', source: NASM },
        { label: 'Weight', value: '≈82 kg with accessories', source: JAKAB },
      ],
    },
    {
      id: 'propellers',
      name: 'Propellers',
      group: 'Powerplant',
      blurb:
        'The real breakthrough. The Wrights reasoned that a propeller is a wing travelling in a spiral, and used their own wind-tunnel lift data to carve one — reaching an efficiency around 70% when contemporaries were managing barely half that.',
      explode: [0, 0.6, -2.4],
      dimensions: [
        { label: 'Diameter', value: '2.59 m · 8 ft 6 in', source: NASM },
        { label: 'Blades', value: '2, laminated spruce', source: NASM },
        { label: 'Rotation', value: 'Counter-rotating, pusher', source: PATENT },
        { label: 'Speed', value: '≈350 rpm', source: PAPERS },
        { label: 'Efficiency', value: '≈70%, by the brothers’ own reckoning', source: PAPERS },
      ],
    },
    {
      id: 'transmission',
      name: 'Chain drive',
      group: 'Powerplant',
      blurb:
        'Bicycle-shop thinking applied to an aeroplane: roller chains running in tubes from one crankshaft sprocket out to both propellers. The port chain is crossed inside its tube, which is the entire mechanism that makes the propellers turn opposite ways and cancel each other’s torque.',
      explode: [0, 1.1, -1.2],
      dimensions: [
        { label: 'Reduction', value: '23 : 8', source: PAPERS },
        { label: 'Chains', value: 'Roller chain in guide tubes', source: NASM },
        { label: 'Port chain', value: 'Crossed, to reverse rotation', source: PATENT },
      ],
    },
    {
      id: 'skids',
      name: 'Landing skids',
      group: 'Structure',
      blurb:
        'Two ash runners, turned up at the front. There are no wheels anywhere on the machine: it took off from a rail and landed on sand.',
      explode: [0, -2.4, 0],
      dimensions: [
        { label: 'Material', value: 'Ash, steam-bent', source: JAKAB },
        { label: 'Launch rail', value: '18 m · 60 ft of two-by-four', source: PAPERS },
      ],
    },
  ],
  bibliography: [PATENT, PAPERS, NASM, JAKAB, INFER],
}
