# Honest spell sounds — 7.62.1

Release **7.62.1**. A failed spell now sounds like a failure.

## The bug

Casting **Alohomora** (Opening Doors) played the recorded door-opening clip in
every room, before the game knew whether there was anything to open. The order
in `class-spells-v726.js` was:

```js
cue(key, 'use');            // alohomora's "use" recording is a door opening
const result = oldCast(...) // "There is no compatible door." — too late
```

So a shout in an empty room, an attempt on an already open door and an attempt
with too little mana all sounded exactly like a successful unlock. The legacy
`Alohomora` branch in `sacred.js` was worse: it spent 8 MP, played the door
recording and announced "releases the lock" even where no door existed.

## What changed

* `class-spells-v726.js` — Alohomora no longer pre-plays its "use" cue. The door
  system plays the recorded click only when a door really opens; a failed
  attempt plays the recorded `board-error` cue. There is no synthesised tone
  anywhere: every cue is a shipped recording in `assets/audio/sfx`.
* `sacred.js` — the legacy branch now asks the door system first. With no
  magical door it says truthfully that nothing happens, spends no mana and
  plays `board-error`. If a door is there it opens it, pays 8 MP and plays
  `magic` then `door` once.
* Words stay honest too: no "lock released" line when no door exists.

## Tests

`tests/spell-sound-honesty-v7621.test.mjs` — 5 tests:

1. no door → no `door` recording, only `board-error`, no mana spent, no line
   claiming a door opened;
2. the typed command `alohomora` and `opening doors` behave the same;
3. at the Drakkar rune door the `door` recording plays exactly once, magic
   plays, 8 MP is paid and the door opens;
4. a second attempt on the open door never repeats the door recording and costs
   nothing;
5. every spell cue used by the class-spells table is mapped to a real audio file
   (`wav`/`ogg`/`mp3`), never to a generated tone.

Four of the five fail on 7.62.0 and pass here.

## Verification by hand

1. Version shows **7.62.1**.
2. In any ordinary room press the Opening Door button or type `alohomora`: you
   hear the recorded error blip, never a door opening, and your mana is intact.
3. Walk to the Drakkar rune door and cast Alohomora: one recorded door click,
   the way opens, 8 MP spent.
4. Cast it again on the open door: the error blip only.
