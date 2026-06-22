# Audio override instructions

The game ships with browser-safe fallback WAV files so it always produces sound when opened directly through `index.html`.

For the authorized Dragon Mania Legends build, replace the fallback files with the approved local sound files and update the paths in `game.js`:

- `hit` — battle regular hit
- `miss` — battle miss
- `victory` — battle victory
- `defeat` — battle loss
- `music` — approved gameplay loop

Use local files in `assets/sounds/`; do not rely on remote Wiki redirect URLs at runtime. This avoids CORS, network, autoplay, and redirect failures.
