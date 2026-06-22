# Dragon Mania Legends asset sources used in this prototype

This package uses the following visual assets downloaded from the Dragon Mania Legends Wiki:

- `assets/dml-welcome-background.jpg` — Welcome Background.jpg
- `assets/dml-dice-dragon.png` — Dice Dragon.png thumbnail (174px)
- `assets/dml-charly-dragon.png` — Charly Dragon.png thumbnail (174px)

The game code maps the following DML Wiki audio files as streaming sources:

- `SFX - Battle Guage Regular Hit.ogg` — hit feedback
- `SFX - Battle Guage Miss.ogg` — miss feedback
- `Battle Victory.ogg` — victory feedback
- `Battle Loss.ogg` — defeat feedback
- `Soundtrack - Background Music 1.ogg` — looping gameplay music

Audio is loaded through the wiki's `Special:Redirect/file/...` endpoint at runtime, rather than bundled locally, because the source file pages timed out during automated retrieval. Replace the `DML_AUDIO_SOURCES` values in `game.js` with local `assets/*.ogg` paths once a direct internal export is available.
