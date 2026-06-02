# Level 2: Native Automata Skirmish

Level 2 is a hotseat automata skirmish built from the four strongest 4-color pieces found during Level 1 exploration.

## Pieces

- `a`: `2R_0L_1R_0R`
- `b`: `3L_0R_0R_1L`
- `c`: `2L_2R_3L_0R`
- `d`: `2L_1R_3L_0R`

Each player has four depot slots. Every slot may choose any piece, so duplicates such as `a, a, b, c` are legal.

## Rules

- The board is a 4-color torus with faction-agnostic trails.
- Players alternate hotseat turns.
- A turn deploys one reserve piece or activates one living piece.
- Deployment chooses a depot piece, a cell, and a direction; it cannot target a living opponent core.
- Deployment immediately runs a `16,384`-step burst.
- Activation runs a `16,384`-step burst from the piece's frozen core.
- Any living opponent core overwritten during a burst dies immediately, and the burst continues.
- After the burst, the active piece's final head becomes its new frozen core.
- The game ends when one player has no living pieces and no reserve pieces, or after `64` turns per player.
- If the turn limit is reached, player biomass from the last-owner matrix decides the winner.

## Run

```bash
podman compose -f podman-compose.yml up --build -d
```

Open:

```text
http://localhost:3001
```

Stop:

```bash
podman compose -f podman-compose.yml down
```

## Test

```bash
podman run --rm lifechess-level-2 npm test
```
