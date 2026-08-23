# Black Soul Ultimate — Engineering audit report (2026-08-23)

Inspected the live repository `Mahicouragw/Black-sold-ultimate` (v7.24.2). The project already had a working AI NPC pipeline (`browser → /api/npc → providers`), web retrieval, game-state grounding, and a full Car Racing District. This pass added the missing SearXNG layer, result sanitization, and TalkBack-first racing commands without ripping out working systems.

## A. Bugs / gaps found

| File | Problem | Severity | Fix |
|---|---|---|---|
| `api/npc.js` | No SearXNG provider; only Brave / NewsAPI / Google News RSS / Wikipedia | High (requested) | Added `searxngSearch()` gated by `SEARXNG_URL` |
| `api/npc.js` | Search hits were trusted without URL/protocol validation | High | `sanitizeSearchHit` rejects `javascript:`, private hosts, non-http(s), strips HTML, redacts injection phrases |
| `car-racing-v28.js` | No text commands: accelerate / map / boost / pit / quit race / tutorial | High | `CarRacing.handleCommand` + overlay buttons |
| `car-racing-v28.js` | Countdown always said “three laps” | Low | Uses real track lap count |
| `car-racing-v28.js` | Rubber-banding undocumented | Medium | Optional, disclosed setting (default off) |
| — | First-time racing tutorial missing | Medium | Spoken once, replay with `tutorial` |

Existing systems that were **already correct** and left in place: NPC `ask`/`say`, snapshot sanitization, SSRF URL fetch, duplicate TTS guard, source links, racing world graph, garage/dealership/rewards, PWA/security scripts.

## B. Files changed

- `api/npc.js`
- `car-racing-v28.js`
- `SECRETS.md`
- `.env.example` (new)
- `tests/npc-searxng-v725.test.mjs` (new)
- `tests/car-racing-v28.test.mjs`
- `ENGINEERING_AUDIT_v725.md` (this file)

## C. AI NPC improvements

**Fallback chain (news):** SearXNG news (if `SEARXNG_URL` set) → Google News RSS → NewsAPI → Brave → Wikipedia → honest “cannot verify”.

**General search:** SearXNG general → Brave → Wikipedia.

**Caching:** 60s news / 5 min general, 200-entry cap, per-IP search rate limit (15/min).

**Security:** Server-only keys; no public SearXNG instance hard-coded; untrusted web text delimited; prompt-injection strings stripped from snippets; SSRF host block reused for SearXNG origin.

**Sources:** title, url, domain, date when present; client still renders accessible links and does not speak raw URLs.

Configure on Vercel / `.env.local`:

```
SEARCH_PROVIDER=searxng
SEARXNG_URL=https://your-instance.example
SEARCH_LANGUAGE=en
SEARCH_TIME_RANGE=day
```

## D. Racing game

**Start:** Walk northwest from Kaliwasch District 16, or type `racing` / tap Racing. Hub: New Race, Continue Race, Choose Car, dealership, upgrades, results, settings, help.

**TalkBack commands (during a race):** `accelerate` `brake` `left` `right` `boost` `status` `position` `map` `pit` `pause` `resume` `quit race` `tutorial`

**Rules:** Seedable tracks, 2–3 laps, 3 NPC cars with distinct stats, collisions, condition, gold/XP, next-track unlock on win. Rubber-banding off unless the player enables it.

**Accessibility:** Buttons with names, live HUD, spoken map (“section X of 12”), first-race tutorial, no sight-required steering.

## E. Tests actually run

```
node --test tests/car-racing-v28.test.mjs tests/npc-searxng-v725.test.mjs \
  tests/npc-websearch-v724.test.mjs tests/npc-url-fetch-v7241.test.mjs \
  tests/npc-intelligence-v723.test.mjs
```

**45 passed, 0 failed.**

```
npm run validate   → audio PASS, world PASS
node scripts/security-check.mjs → PASS
node scripts/pwa-check.mjs → PASS
```

`npm test` for the full suite requires `jsdom` (`npm install`). After install, world-loading tests depend on every script remaining syntactically valid; racing + NPC suites above are the ones that cover this change.

## F. Remaining / not verified here

- No physical TalkBack device or Android emulator was available; TalkBack was verified via ARIA labels, `aria-live`, command coverage, and unit tests — not a real screen reader.
- Production Vercel was not redeployed from this workspace. Set `SEARXNG_URL` on Vercel if you want SearXNG in production; without it, Google News RSS + Wikipedia still work.
- Did not rewrite combat, multiplayer, or Capacitor/Android. Those were inspected at a high level and not broken by these edits.
- SearXNG capacity is not guaranteed; failures fall back.

Never fabricate current news. Never put API keys in the client.
