# Built-in narration and gesture interface — 7.26.0

## Enable and switch modes

Tap **Start spoken gesture controls** at the top-left of the page. This explicit
user activation selects **Accessible Gesture Mode**, enables browser TTS, and
opens an optional tutorial. Android TalkBack is not used or controlled. The same
mode is available in Settings → Interface mode. Returning players can skip the
lessons; hero saves are not migrated or reset.

Use **Game controls** to browse the actual title, hero creation, settings, and
open-panel controls. Native text entry still uses the device keyboard; use
Generate Unique Hero Name if you do not want to enter a name. After the name
availability check, choose **Refresh available controls** to include Begin
Adventure. Password/PIN input values are never narrated by this adapter.

**Narrator settings** provides test/enable, disable, pause, resume, repeat, rate,
volume, walk-repeat interval, tutorial, and remapping. Pause, Resume and Repeat
also have always-visible buttons. Settings → Built-in game narration toggles
ordinary event narration independently of visual mode. The existing Device voice
and TTS toggle remains the absolute speech-output gate.

Switch back with Narrator settings → **Sighted Visual Mode**, or Settings →
Interface mode. The original game interface, keyboard, command input, music and
buttons remain in place. Speech can be disabled separately. Switching mode
stops walking and never resets the hero.

## Default world mappings

Gestures apply **only on the bordered Gesture surface**, not across the whole
browser. This keeps native form fields and scrolling usable.

| Gesture | Action |
|---|---|
| Swipe up | North |
| Swipe down | South |
| Swipe left | West |
| Swipe right | East |
| Cardinal swipe, keep finger down 550 ms | Repeat that direction, initially every 800 ms |
| Release hold | Stop and cancel any pending hold step |
| Down-right | Contextual actions, or combat actions during combat |
| Up-right | Known magic and healing choices; choose Cast or Cancel |
| Up-left | Nearby interaction choices, without guessing which object to activate |
| Double tap | Nearby interaction choices |
| Down-left | Navigation and route guidance (not an invented backward mechanic) |
| Two-finger tap | Inventory |
| Stationary one-finger hold, 550 ms | Sit at a valid local seat |
| Stationary two-finger hold, 550 ms | Lie on a valid local bed |
| Single tap | Repeat last message |
| Any two-finger swipe | Cancel/back; fixed and not remappable |
| Stop walking button | Emergency stop, including a pending movement |

World gestures are remappable. A token always has one action; assigning the same
action to two tokens does not combine actions. Movement repeats only for
cardinal swipe tokens mapped to movement. Menu gestures are intentionally fixed
so remapping cannot remove the way out. Stairs and diagonal **world routes** are
selected in Navigation, rather than overloading diagonal action swipes.

### Menus

Down = next; up or right = previous; double tap = activate; single tap = repeat
selection; left = back. Two-finger swipe always cancels. Menus speak all options
on the current page; lists longer than eight entries have Next/Previous page
choices. Bottom controls remain available. Escape cancels and arrow keys/Enter
work on the focused gesture surface.

## Real engine integration

- `gesture-accessibility.js`: one Pointer Events recognizer, shared menu adapter,
  remapping/settings, tutorial, location context and narrator bridge.
- `music.js`: the original shared SpeechSynthesis queue is retained. Adds a
  12-pending-item cap, deduplication, ordered combat priority, critical health
  interruptions, coalesced location speech, rate, pause/resume/repeat and honest
  engine-error/watchdog status. Music continues to duck through the same manager.
- `game.js`: cancellable delayed movement rechecks origin/combat/visibility;
  real unequip action clears body-slot/legacy aliases and recalculates sets.
- Doors use `openPhysicalDoor`/`closePhysicalDoor`; shops use the existing stock,
  buy/sell commands; NPCs use existing talk commands; combat uses the command
  engine, not a new damage or reward system. Known spells retain the current
  downstream spell validators, mana and cooldown checks.
- Inventory actions are derived from actual item types/effects. Destructive
  drop/sell/projectile spending asks for confirmation, defaulting to Cancel.
  Equipped/quest/artifact items are not offered as public drops. Generic Throw
  is not offered: the old engine aliases it to a public drop. Silver arrows
  instead use the existing `shoot` action. Unequip retains the carried stack.
- Existing Enchantery choices state the actual permanent bonus and escalating
  gold cost, then call `enchantItem`. Existing Command Beast duration is described
  as two companion turns, not a fabricated time duration.
- Navigation reads live `exits` and `findPhysicalRoute`; routes recompute each
  step and report steps, not invented straight-line bearings. No world locations,
  exits, quest rewards, or save identifiers were replaced.
- Posture is stored on the existing saved player object. Valid furniture is the
  private foyer's described guest bench, the existing park benches, and double
  bedrooms' beds. Sitting/lying requires safety and no pending move/combat.
  Stand/wake restores movement. Leaving a node or starting combat clears posture.
  No teleport, free healing, new sleep timer, or time-progression rule was added;
  paid tavern rest still uses the existing rest function.

## Validation and remaining release gates

Local suite: **306 passed, 0 failed, 1 skipped (307 total)**. The skip is the
existing live-NPC-provider test, which needs a configured server API key. Fifteen
new integration tests evaluate the real `index.html` script order in JSDOM and
exercise movement, cancellation, double/two-finger gestures, context doors,
posture, healing, equipment, combat, routes, speech deduplication/bounds and
speech errors.

Actual served page: `scripts/test-gesture-browser.mjs` exercises Chromium native
CDP touch input, user activation, swipes, hold/release, two-finger inventory and
cancel, both interface modes and uncaught page errors. This is an optional smoke
script, not a shipped dependency or an Android-audio acceptance test. External
identity/cloud requests are blocked in the sandbox; their server behavior is
covered only by existing tests, not a new live integration claim.

Audio/world validation, PWA/precache checks, production build, `git diff --check`,
and security/secret scan passed. The initial security gate found existing
Capacitor Android/iOS proxy vulnerabilities and a brace-expansion advisory;
minimal patch updates to 7.6.9 and 5.0.12 respectively leave **0 audit findings**.
Production output contains the gesture module; both worker caches are versioned
7.26.0. Build output was removed after validation to respect workspace limits.

### Limitations — do not claim full device acceptance yet

1. **Physical Android with TalkBack OFF has not been tested.** Headless Chromium
   in this environment reports `synthesis-failed` (no usable installed voice).
   The error is shown rather than claiming speech succeeded. Mock-based speech
   tests verify dispatch/queue/state, not audible output. Before release, use a
   current Android Chrome device with installed voice data and test the entire
   tutorial → navigation → combat → healing → inventory → save/reload flow by ear.
2. SpeechSynthesis availability, pause/resume reliability, voice data, and offline
   speech depend on the browser/device. There is no bundled offline voice or
   unsupported native-TTS fallback. If synthesis is unavailable, text and the
   original semantic controls remain, but blind gesture-only play cannot be
   promised on that device.
3. Enemy encounter entities have **no compass position or distance coordinates**.
   They are reported at the current location. There are no fictional east/west
   enemy warnings. World route directions are taken from actual graph edges.
4. Some legacy/class spells have layered overrides that differ from spellbook
   metadata. Their menu explicitly calls the metadata cost **listed**, and the
   existing cast reports actual failures. A unified public cost-preview API for
   every legacy spell remains future work; the adapter does not invent values.
5. Location items, shops, basic NPC talk and progression controls have direct
   adapters. Specialized expansion panels use the visible-control browser;
   long lists require pages. Free-form messages/commands still require the
   device keyboard. This is not a guarantee that every online/minigame flow is
   now practical with gestures alone.
6. Posture is not a new full sleep simulation. No ordinary-bedroom bed is
   inferred where the existing room only describes a wardrobe and desk.
7. Production is **not deployed or publicly verified**. The existing Pages
   environment permits only `main`; work remains on the session branch, without
   changing that environment or pushing to main. Audible Android acceptance and
   review should precede merging and the existing gated Pages workflow.

Re-run normal gates with `npm test`, `npm run validate`, `npm run pwa:check`,
`npm run security`, and `npm run build` (remove generated `www/` afterwards).
For optional Chromium smoke, start `npm run dev`, install `playwright-core` and
`@sparticuz/chromium` without saving dependencies, and run
`node scripts/test-gesture-browser.mjs`. Some Linux images need Chromium's shared
libraries on `LD_LIBRARY_PATH`. Do not confuse a green touch smoke with physical
Android TTS acceptance.
