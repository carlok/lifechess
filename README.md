# Lifechess

Lifechess is an experimental game/research playground for AI-native games: games whose strategic objects come from computational substrates rather than human board-game conventions.

The current work is split into separate local levels:

- `level_1/`: Toroidal Crucible, a Podman-based tournament and visualizer for multi-color Langton-style automata.
- `level_2/`: Native Automata Skirmish, a hotseat roster game where players deploy and activate evolved automata on a shared toroidal substrate.

Both levels are container-first. Run each level from its own folder with its own `podman-compose.yml`.

## Level 1

```bash
cd level_1
podman compose -f podman-compose.yml up --build -d
```

Open:

```text
http://localhost:3000
```

## Level 2

```bash
cd level_2
podman compose -f podman-compose.yml up --build -d
```

Open:

```text
http://localhost:3001
```

## Notes

The project keeps generated data and local runtime artifacts out of version control. The `tex/` folder contains drafting material and is intentionally excluded from the root repository.
