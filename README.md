# The Machine Archive

**A digital museum of machines rebuilt from drawings, measurements, and historical records.**

The Machine Archive turns important machines into interactive 3D exhibits. Instead of placing a static model behind glass, it lets visitors inspect how a machine is assembled, trace the evidence behind its dimensions, and take its controls in a simulation governed by the same documented specifications.

Reading about a machine is not the same as watching it work. The Machine Archive is built around that difference.

## The Idea

Many machines that changed history can no longer be experienced as their builders intended. Some survive only as drawings and short descriptions. Others remain in museums but are too rare, fragile, or dangerous to operate. Even a faithful physical reconstruction usually represents one interpretation and reveals little about how uncertain decisions were made.

The Machine Archive treats reconstruction as an argument supported by evidence, not just a finished 3D model. Every exhibit connects geometry and behavior to its source:

- **Documented facts** come from historical specifications, published research, and museum records.
- **Measured values** come from surviving artifacts and trusted institutional collections.
- **Inferences** are identified clearly wherever the historical record is incomplete.

The result is a museum where visitors can see both the machine and the reasoning used to rebuild it.

## The Experience

Each machine has its own exhibit page and interactive simulation.

In the exhibit, visitors can:

- Orbit around the machine and zoom into small details.
- Select individual components and inspect their purpose and dimensions.
- Pull the assembly apart with an exploded view.
- Use an X-ray view to reveal internal systems.
- Adjust machine-specific controls and observe the mechanism respond.
- Read the source attached to each modeled value.

From there, visitors can take control. The simulation uses cited figures such as mass, dimensions, power, aerodynamic area, speed, and mechanical limits. Outcomes are produced by the model rather than played as keyframed animations: the Wright Flyer stays close to the sand, the Mustang rewards careful energy management, and the T-34 cannot pivot in ways its transmission did not permit.

## Opening Collection

### Wright Flyer

The first successful powered, controlled, sustained flight of a heavier-than-air machine. The exhibit explores the Flyer as a complete control system: wing warping, coupled rudder movement, elevator input, twin propellers, and the lightweight structure that held everything together.

### P-51 Mustang

A long-range Second World War fighter shaped by the relationship between aerodynamic efficiency, engine power, fuel, and pilot control. Visitors can inspect the aircraft in the gallery, then fly it to experience how speed and energy define its operating envelope.

### T-34-85

A wartime medium tank designed around mobility, protection, firepower, and manufacturability. Its exhibit exposes the relationship between hull, turret, running gear, and armament; its simulation lets visitors drive and operate the machine within its documented constraints.

Together, the three exhibits tell a broader story about control: learning to leave the ground, mastering high-performance flight, and moving a heavy machine across difficult terrain.

## Why It Matters

Traditional museum displays are excellent at preserving objects, but machines are defined by movement. A wing is better understood when it twists. A control surface makes more sense when it changes a flight path. A tank transmission becomes tangible when it limits how the vehicle can turn.

The Machine Archive combines the care of a museum catalogue with the immediacy of a simulator. It is intended to make engineering history explorable without hiding uncertainty or separating an object from the way it worked.

## Technology

- [React](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [Three.js](https://threejs.org/) through React Three Fiber and Drei
- [Tailwind CSS](https://tailwindcss.com/)
- React Router
- pnpm

## Run Locally

Requirements: a current Node.js release and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

Create a production build with:

```bash
pnpm build
```

Run the linter with:

```bash
pnpm lint
```

## Project Structure

```text
src/
  components/   Exhibit controls, inspectors, labels, and simulation HUD
  data/         Machine descriptions, parts, dimensions, and citations
  pages/        Museum, exhibit, and simulation pages
  sim/          Machine behavior, environments, controls, and scenarios
  three/        3D geometry, materials, and gallery presentation
```

## Sources

The collection draws on institutional and historical references, including:

- [Smithsonian National Air and Space Museum](https://airandspace.si.edu/collections/wwii-aircraft)
- [Royal Air Force Museum collections](https://collections.rafmuseum.org.uk/)

Detailed citations are presented inside each exhibit, next to the facts and dimensions they support. Where sources are silent or disagree, the reconstruction labels the chosen interpretation rather than presenting it as settled fact.
