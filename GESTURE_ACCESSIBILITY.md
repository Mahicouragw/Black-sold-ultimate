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

## Default world mappings — walk and turn (7.59.0)

The hero walks like a person: the way they are **facing** decides where forward
is. Turning changes only the facing; walking changes only the room. Both use the
real exits of the room graph, so a swipe can never teleport the player.

| Gesture | Action |
|---|---|
| Swipe up | Walk one step **forward**, in the direction the hero is facing |
| Swipe down | Step **backward** (opposite the facing) without turning round |
| Swipe left | Turn left on the spot (90° by default, 45° in settings) |
| Swipe right | Turn right on the spot |
| Draw a circle | Turn around (180°) |
| Single tap | Start continuous forward walking; tap again to stop |
| Long press (hold) | Walk forward while the finger stays down; release stops, including any pending step |
| Two-finger tap | Stop instantly and say where you stopped |
| Down-right | Contextual actions, or combat actions during combat |
| Up-right | Known magic and healing choices; choose Cast or Cancel |
| Up-left | Nearby interaction choices, without guessing which object to activate |
| Double tap | Nearby interaction choices |
| Down-left | Navigation and route guidance (not an invented backward mechanic) |
| Stationary one-finger hold on a seat | Sit at a valid local seat |
| Stationary two-finger hold | Lie on a valid local bed |
| Any two-finger swipe | Cancel/back; fixed and not remappable |
| Stop walking button | Emergency stop, including a pending movement |

Turning is announced with the new facing and what is really ahead:
*"Facing east. Ahead: Kaliwasch District 8."* or *"Facing south. No path straight
ahead. From here you can go north, east, west."* A blocked step is spoken as
blocked and never as a success.

**Sensitivity** (`Narrator settings → Swipe sensitivity`) changes how far the
finger must travel: low 60 px, medium 36 px, high 22 px. **Turn step** switches
between 90° and 45°. **Walk and turn gestures** can be switched off for the older
compass swipes, where one swipe is one compass direction.

### Compass swipes (optional, off by default)

| Gesture | Action |
|---|---|
| Swipe up / down / left / right | North / South / West / East |
| Swipe + hold 550 ms | Repeat that compass direction every 800 ms |
| Two-finger tap | Inventory |
| Single tap | Repeat last message |

## Combat gestures during a fight (7.59.0)

When a fight starts, the game itself says *"Combat started. One enemy (name) is
nearby. Up-right attacks, up-left casts, down-right defends or dodges, down-left
heals."* The four diagonal swipes become combat-only while `inCombat` is true,
and the automatic combat menu no longer blocks them. Walking swipes are refused
during combat with a spoken reason, so a fight can never move the hero.

| Gesture (combat only) | Action |
|---|---|
| Swipe up-right | The chosen combat ability (Basic Attack by default). Change it from **Combat actions → Combat abilities** |
| Swipe up-left | The chosen spell (chosen once; the spellbook opens the first time) |
| Swipe down-right | Defensive stance: brace so the next enemy blow is halved |
| Swipe down-left | Heal: cheapest known healing spell you can afford, otherwise a healing item, otherwise a spoken explanation and no consumption |
| Two-finger swipe right / left | Next / previous nearby object (outside combat) |
| Double tap | Act on the focused object, otherwise open the real interaction choices |
| Two-finger tap | Inventory |
| Down-right | Combat actions, including the full ability list, magic, inventory, flee |

Every result is spoken from real state: damage dealt, health before and after,
mana spent, cooldown remaining. Failures always state their reason (*"not enough
magic"*, *"not ready"*, *"you have not learned the spell"*, *"no locked door
here"*). A second identical swipe inside 250 ms is ignored so a bouncing finger
cannot spend a second turn.

### Abilities

| Ability | Real rule | Cost | Cooldown |
|---|---|---|---|
| Basic Attack | Ordinary weapon attack, 8% base miss | none | none |
| Heavy Attack | Lands 65% (+¼ dexterity, max 85%), 1.7× weapon damage | none | 2 combat actions |
| Quick Attack | Lands 92% (+¼ dexterity, max 97%), 0.6× weapon damage | none | 1 combat action |
| Multi-Strike | The Multi Strike spell: three separate strikes | 18 mana (spell system) | 8 s |
| Magical Attack | Your chosen damaging spell, real cost and fizzle | spell cost | spell rules |
| Defensive Stance | `defend()`: next enemy blow halved | none | 1 combat action |
| Special Ability | Your class power (Battle Cry, Ice Storm, Backstab, Holy Light, Hammer Smite, Piercing Volley, Chi Burst, Thorn Storm) | spell cost | spell rules |

Cooldowns advance once per combat action and are saved, so reloading cannot
reset a heavy swing mid-fight. A cooling ability is refused with the number of
actions left and spends nothing.

### Spell mastery

`mastery <spell>` (or `mastery` for every spell) reports attempts, successful
casts, failures, mastery percent, mastery level and MP efficiency. Mastery is
counted by the outermost cast wrapper, so every casting system in the game is
included. A cast is a success only when health, enemy health or a real utility
effect changed; "not enough mana", cooldown refusals and fizzles are failures.
The voice line for a highly practised spell is:

> *"Your Multi-Strike mastery is 90 percent. You are becoming highly skilled.
> Continue practising to improve your mastery."* — plus the explicit warning that
> mastery is practice, not a guarantee: mana, cooldowns, resistance and the
> spell's own chance still decide each cast.

Mastery is stored in `Game.state.spellMastery` (abilities `attempts`,
`successes`, `failures`, plus the existing xp/casts/totals) and saved with the
hero.

### Objects and inventory

Two-finger swipe right walks the list of what is really in the room — people,
takeable items, the door, stairs — reading *position, name, what it is, whether
it can be collected, and its purpose*. Double tap collects the item, opens or
closes the door, talks to the person or uses the object; a pickup that did not
enter the pack is never reported as a success, and a second double tap on a
collected object cannot duplicate it. Two-finger tap opens the inventory with
name, category, quantity and purpose; Use/Equip ask for confirmation before
anything irreversible, and the game re-checks that the item is still carried
before acting.

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
