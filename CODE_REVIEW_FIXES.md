# 🐞 Code Review & Bug-Fix Pass — v7.8.6 (2026-07-19)

Full-repo bug hunt: static syntax gates, cross-reference analysis (every
`Game.*` / `MusicSystem.*` / `OnlineSystem.*` / `GameHall.*` call verified to
have a definition, DOM-id audit, service-worker asset audit) **plus a headless
runtime simulation** (jsdom) that boots the entire game (all 31 scripts),
runs commands, starts combat and plays 3 attack rounds.

## Bugs found & fixed

### 1. Combat block chance ignored the player's DEX stat (real gameplay bug) ⚔️
Files: `cemetery-spellfield-combat-v11.js`, `expansive-forest-multitarget-v13.js`, `fair-group-combat-v14.js`

```js
// BEFORE — JavaScript reads this as  e.dex || (0 - p.dex)
blockChance = ... + (e.dex || 0 - p.dex) / 200 ...
// For any enemy with dex > 0 the second branch never ran, so the player's
// DEX was ignored and RAW enemy dex inflated block chance (over-blocking).
// AFTER
blockChance = ... + ((e.dex || 0) - p.dex) / 200 ...
```
Affected spells/attacks: Multi Strike (v11 & v13 forest), group-combat target
attack (v14). High-DEX heroes now correctly reduce enemy block chance.

### 2. Load-time crashes when storage is unavailable 💾
Files: `online.js`, `translation.js`

`localStorage.getItem(...)` ran at **module initialization** (object-literal
properties). If storage is blocked/unavailable the exception killed the whole
file — and, since `sacred.js` (and 20+ other modules) reference `OnlineSystem`
at load, one storage error cascaded into a **total game boot failure**.
Both reads are now wrapped in safe `try/catch` IIFEs with sensible defaults.

### 3. `sacred.js` hard dependency crash 🔗
`topic==='online' ? OnlineSystem.status : ...` — a bare identifier reference
that throws `ReferenceError` if `online.js` ever fails to load (see #2), taking
down the rest of the boot sequence. Now uses `window.OnlineSystem?.status`
with an offline fallback message.

### 4. `media.play()` crash on legacy WebViews 📱
File: `music.js` (SFX fallback paths)

HTMLMediaElement `.play()` can return `undefined` (older Android WebViews /
jsdom), so `effect.play().catch(...)` itself threw `TypeError`. Both fallback
paths now guard the returned promise.

## Verification
- `node --check` — all 30 JS files pass.
- Headless jsdom boot: `Game`, `MusicSystem`, `OnlineSystem`,
  `TranslationService` all initialize; `processCommand('look'/'help')`,
  `move()`, `startCombat('wolf')`, 3× `playerAttack()` (enemy defeated),
  `save()`, `MusicSystem.playSFXAndWait()` — all green.
- Cross-reference analysis: zero undefined method calls; zero missing DOM ids;
  service-worker cache paths all exist.

*(Remaining jsdom-only noise: `HTMLMediaElement not implemented` and the
supabase anonymous-session handshake — both require a real browser/network.)*
