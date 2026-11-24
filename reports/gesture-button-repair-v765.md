# 7.65.0 — Gesture and button repair, and the spoken in-game guide

Every fix in this release was reproduced first, then fixed, then covered by a test
that uses the same surface a player uses: a real world swipe (`GlobalSwipes`), the
gesture pad, a real combat button, or a typed/spoken command.

## What was actually broken

| # | Symptom on the device | Cause found in the code | Fix |
|---|---|---|---|
| 1 | Gestures "stop working" until the page is reloaded | `GlobalSwipes` kept a pointer that never reported `pointerup` (app switch, call, finger lifted outside the window). With one phantom finger in the map, every later swipe was counted as two fingers and dropped forever. | Phantom fingers are dropped after 1.5 s, the tracker is cleared on `blur`, `pagehide` and `visibilitychange`, a gesture older than 12 s is ignored, and a third finger resets instead of stacking. |
| 2 | Diagonal walking set in narrator settings did nothing outside the pad | `GlobalSwipes` routed every non-combat diagonal to the four menus and never read `settings.corners`. | The world swipe now honours "Corner swipes walk diagonally". Menus remain the default and are still one setting away. |
| 3 | Two-finger up/down said "there is no path up" and during a fight could push a movement command | The global layer sent a raw `up`/`down` command instead of the stairs handler. | Two fingers are the stairs through `UI.handle('go_up'/'go_down')`, exactly like the pad, and during a fight they speak the combat gestures instead of moving. |
| 4 | A swipe that started on a panel could fire a combat action | The global layer tracked swipes on panel and dialog surfaces. | Panels and dialogs now own their own pointer gestures; the world ignores swipes that begin inside them. |
| 5 | Opening a panel made gestures mute: nothing happened, nothing was said | `UI.handle`, `move`, `verticalMove`, `walkStep` and `canFight` returned silently while a panel was visible. | Every one of them now says "A panel is open. Swipe left to close it, then gesture again", at most once every three seconds. In a fight the message names the four combat swipes. |
| 6 | "Multiple Strike" button stayed disabled for heroes who know the spell | Availability compared the spellbook name with `multi strike` only. | Both `multi strike` and `multiple strike` enable the button; group fights are recognised through living targets, not only `state.enemy`. |
| 7 | Buttons stayed stale after an action, and group fights could disable every button | Availability was computed once per fight from `state.enemy` only. | Living encounter targets now count as combat, and availability is re-checked after every button command. Combat-only buttons stay disabled once the battle ends, as before. |
| 8 | The tutorial and reference told the player the wrong gestures | Old text claimed up-right opens spells and down-right opens combat actions. | All reminder text now matches the shipped behaviour: up-right attacks, up-left casts, down-right defends, down-left heals, and the four corner menus are named correctly. |

## The spoken in-game guide

Say **guide**, **spoken guide**, **how to play**, tap *Spoken guide* in Settings, or
open *Visible game controls → Spoken guide*. Six chapters, each spoken, with
Repeat / Next / Back to chapters:

1. All eight directions — north, north-east, east, south-east, south, south-west, west, north-west, plus up and down.
2. Inventory — two-finger tap, categories, items, inspect, use, equip, drop.
3. Chests, items and doors — `open chest`, keys, loot, `open door`, Alohomora, Multiple Strike, the Christmas toy chest.
4. Board games — Snakes and Ladders, Ludo and Chess, with the real gesture and command for each.
5. Combat — the four swipes, the nine buttons (accesskeys 1–9) and the typed commands.
6. Menus, help and recovery — menu keys, repeat, pause/resume speech, guide and self check.

Say **check controls** (or tap *Check my controls*) to hear a truthful self check:
gesture surface present, world swipes listening, gesture mode on/off, how many of
the nine combat buttons exist and how many are enabled, whether a fight is running,
and whether the board-game and inventory layers are loaded.

## Verification

- `tests/gesture-guide-v765.test.mjs` — 12 tests: eight directions by gesture token,
  corner-swipe walking through a real world swipe, corner menus unchanged, stairs by
  two fingers, no movement during a fight, phantom-finger recovery, panel ownership,
  spoken panel refusals, button availability and refresh, guide coverage and
  reachability, and the self check.
- Full suite, `npm run validate`, `npm run build`, `npm run pwa:check` — see the
  release notes for the exact counts.
