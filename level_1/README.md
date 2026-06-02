# Level 1: The Toroidal Crucible

Proof-of-concept tournament engine for multi-color Langton-style ants on a toroidal grid.

The project is intentionally container-first. Run it from this `level_1` folder with Podman; source and SQLite data are bind-mounted, and no host Node or SQLite install is required.

## What It Does

- Generates the full rule spaces:
  - `N=2`: 16 rules
  - `N=3`: 216 rules
  - `N=4`: 4096 rules
- Runs clean-board matches with two randomly placed ants.
- Uses alternating macro-turn pulses: `A -> B -> A -> B`.
- Scores by last-author ownership biomass.
- Records aggregate rule stats and match rows in `data/lifechess.sqlite`.
- Serves a Canvas visualizer at `http://localhost:3000`.
- Includes a solo shape viewer for watching strong rules grow alone on the torus.

## Rule Format

A rule has one transition per native color index.

Example for `N=3`:

```text
1L_2R_1L
```

Meaning:

- color `0` -> write `1`, turn left
- color `1` -> write `2`, turn right
- color `2` -> write `1`, turn left

Mixed-color tournaments run in a 4-color arena. Smaller rules interpret foreign colors as `color % nativeColorCount`.

## Run The App

```bash
podman compose -f podman-compose.yml up --build -d
```

The compose file mounts `.:/app`, keeps `/app/node_modules` in an anonymous container volume, and stores SQLite under the local `data/` folder. Source, tests, and frontend files update live without installing Node or SQLite on the host.

Open:

```text
http://localhost:3000
```

Stop:

```bash
podman compose -f podman-compose.yml down
```

## Visualizer

The toolbar has two modes:

- `Match`: fetches a random two-ant match for the selected color count.
- `Custom`: runs two hand-entered rules against each other for the selected color count.
- `Solo`: renders the Rule A / Solo text box alone on the torus. The dropdown is only a preset loader; changing it copies a known winner into Rule A.

Solo presets include winners from recent 32, 64, 128, and 512-rule experiments.

The canvas renders with image smoothing disabled, so scaled cells should have hard pixel edges. If the page still looks soft, check browser zoom or display scaling first.

## Tournament Commands

Run tests:

```bash
podman run --rm -e NODE_OPTIONS=--experimental-sqlite lifechess-level-1 npm test
```

Run a same-color pool tournament:

```bash
podman run --rm \
  -v "$PWD/data:/app/data" \
  -e NODE_OPTIONS=--experimental-sqlite \
  -e DB_PATH=/app/data/lifechess.sqlite \
  lifechess-level-1 npm run tournament -- 4 64 pool
```

Run a mixed 2/3/4-color pool:

```bash
podman run --rm \
  -v "$PWD/data:/app/data" \
  -e NODE_OPTIONS=--experimental-sqlite \
  -e DB_PATH=/app/data/lifechess.sqlite \
  lifechess-level-1 npm run tournament -- 4 128 mixed
```

For mixed pools, selection is balanced and capped by available rules. A 512 pool currently means:

- all 16 two-color rules
- all 216 three-color rules
- 280 sampled four-color rules

## API Highlights

```text
GET  /api/rules?n=2
GET  /api/random-match?n=4
GET  /api/solo-shape?n=4&rule=2R_0L_1R_0R
POST /api/tournament/pool
POST /api/tournament/mixed-pool
```

## Recent Smoke Results

Mixed 512 pool:

- `130,816` matches
- runtime around `6m 39s`
- winner: `N=4 2R_0L_1R_0R`
- record: `495-16-0`
- average biomass margin: `+7512.05`

Best lower-color rules from that run:

- best `N=3`: `2L_0R_1L`, rank `14`
- best `N=2`: `1R_0L`, rank `75`
