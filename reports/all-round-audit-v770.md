# Whole-game audit, fairness pass and what still needs your decision — 7.70.0

This round answers the owner's report: bugs across the whole game, buttons that
do nothing, battles that are not fair, Christmas fairness, a security review,
the wrong door sound, and the house that could not be bought.

---

## 1. The door sound (reported: "the door is not open, but the door opening sound is coming")

**Cause.** `Game.openPhysicalDoor` at a *private* house played `door` in both
outcomes:

```js
if (!house) { addNarrative('The door is locked…'); MusicSystem.playSFX('door'); return; }
```

So the refusal sounded exactly like a door swinging open. **Fixed:** a locked
door now plays `board-error` (a rattle, not an opening), and only the owner's
key turning plays `door`. Covered by a test that spies on the sound system.

While walking the streets, the sound you hear is the *footstep* for that floor
(wood inside houses), which is intentional — the door sound was the locked-door
bug above.

---

## 2. Buying a private house (reported: "the action is not available")

**Cause.** `buyHouse()` only worked when the hero stood exactly on
`<city>_district_2` — the second street of a city grid. Anywhere else it replied
"Buy houses only from an estate agent on House Lane" and nothing else: no
location, no price, no route, no button. The feature existed but was effectively
unreachable.

**Now:**
* `houses for sale` — every city, its price, whether it is already yours, and
  whether the agent is beside you.
* `estate agent` — where the agents stand and the exact route (second street of
  every city grid), plus the distance-purchase alternative.
* `buy house` at the agent, or `buy house kaliwasch` from anywhere.
* Not enough gold: the exact shortfall is named, with a way forward.
* Unknown city: no deed signed, with the real price list.
* **A button on the estate agent's street**: "Houses for Sale" and
  "Buy This House — 1200 Rupees", so nothing has to be guessed.
* After purchase the narration says where the door is and that the key is yours.
* The estate-agent features are matched loosely (`/estate agency/i`) because a
  later module rewrites that street's feature list — the exact-string test was
  why the button never appeared.

Prices: Kaliwasch 1200, Aurora City 1500, Seabreeze City 1600, Ironspire City
1800; each deed includes seven days of property tax, eight rooms and a locked
Storage Room.

---

## 3. Battles made fair

Fairness cannot be written inside one combat module: the game has several
(single fight, group encounter, island storms, spell damage) and each computes
its own numbers. A rule in one is invisible to the rest — which is how a
high-level road could hold a creature that emptied a full-health hero in a
single turn.

**New `fairness-v770.js`, loaded after every combat layer, enforces one promise:**

> A single enemy turn never removes more than **two fifths** of the hero's health
> (**half** for a boss), and no creature enters a fight able to swing harder.

* Implemented by clamping the *turn's* health loss, so it holds whatever any
  layer believes it dealt.
* Also caps a creature's swing at combat start, so long fights stay survivable.
* The narration stays honest: *"The blow glances off; you keep your feet and
  your turn."*
* `fairness` (or `battle fairness`) explains the rule and the current cap.
* Companion splash damage is now rarer and lighter (25% chance, half a blow).
* Endurance still scales with level — fights stay long, they just stop being
  one-shot.

---

## 4. Christmas: fair, and the plan for more fun

**Fairness fix (shipped).** Advent doors only opened on their own night, so a
hero who missed December 5th could *never* finish the row — and Santa's present
required all twenty-five. Doors now stay open for the rest of the festival
(future doors stay sealed): `doorOpen(n) = festivalOpen && today >= n`. A late
arrival can still walk the whole row; the calendar still cannot be opened early.

Already fair and verified: presents are graded by what the hero *earned* (secret
word found, city decorated), not by luck; Santa's present is once a year and
never gold; no door grants a reward that another player cannot reach.

**Planned next (for your yes/no):**
1. **A door for the days after Christmas** — December 26–31 as a "twelfth night"
   row with one candle-lighting task a day, so the event does not end flat.
2. **Carolling with the crier** — sing the three recorded carols back in the
   right order for a winter cloak that is cosmetic only (never power).
3. **A gift exchange** with the town NPCs: give away one item you own, receive a
   wrapped parcel graded by generosity, not by price.
4. **Frost prowler bounty board** — three bounties a day, identical for every
   player, so nobody's luck decides their reward.
5. **A shared Advent tree** — each solved door adds a light for everyone online
   that day (server row, no reward attached), so the city visibly fills up.

---

## 5. Buttons and dead features (whole-game functional check)

**New tool: `npm run ui:audit`** (`scripts/audit-ui-bindings.mjs`, now part of
`npm run validate`). It reads `index.html`, finds every button/input/select with
an id, and proves each is reached by some script; it also checks every
`data-cmd` value has a real branch.

**Found and fixed:**
* `#multi-screen` — a whole "Multiplayer Setup" screen that could not be opened
  from anywhere, with a *Game Mode* select no script ever read, promising
  turn-by-turn co-op that does not exist. Removed; real multiplayer is the
  Online Game Hall and a brotherhood/combat group.
* `#mp-mode` — the dead select inside it (gone with the screen).
* **`play chess`, `play ludo`, `play snakes`, `play carrom`, `play blackjack`** —
  five action buttons in the Game Hall that sent a command nothing handled. They
  now open the hall and select the game.

Result: **139 controls, every one reached by a script; 50 quick commands, every
one handled.**

---

## 6. Security review

| Area | Result |
|---|---|
| `bsu-data` gateway | Token verified against Google's keys (RS256, aud/iss/exp/iat checked), **player id always from the token, never the body**, guests identified by a hashed device key, per-player rate limit (300/min), body cap 3.2 MB, reserved `g-` prefix refused for Google ids |
| `bsu-audio` studio | Google-only sign-in, owner row checked in the database, cue name validated, **file signatures checked** (a renamed text file is refused), 3 MB cap, service key never leaves the function |
| Guest identity | Device key is 64 hex chars, id is `sha256('bsu-guest:'+key)` — an id cannot be claimed without the key |
| Client XSS | Player names, chat text, room names and hero suggestions all pass through `escapeHTML`; no unescaped interpolation into `innerHTML` found in the audited paths |
| Secrets | `npm run security` secret scan: PASS; no service keys in the repo |
| Storage | Only public read for published audio; uploads require the owner check |

No new vulnerabilities were introduced by this round; the two new client files
carry no network calls at all.

---

## 7. Real payments for houses — an honest answer

The game currently **cannot take real money**, by design: it is a static site
(GitHub Pages + Vercel) behind a Supabase edge function, with no merchant
account attached. Making "buy a house with a bank card" real needs decisions
only you can make:

1. **A payment provider account** — Stripe or PayPal, in your name, with its
   secret keys stored as Supabase edge-function secrets. I can build the
   checkout, the webhook and the idempotent grant, but I cannot create or hold
   that account.
2. **A server-side ledger** — purchases must grant gold/diamonds inside the
   database function, never in the browser, or a player could simply fake the
   success message.
3. **Store rules** — the Android build sells digital items through the app: Play
   Store policy then requires Google Play Billing for those purchases, which is
   a separate integration from a web checkout.
4. **Age and tax rules** — real-money purchases for minors, refunds, and local
   tax are legal questions, not code ones.

Three shapes I can build **on your word**:

* **A) In-game gold only** (what exists now, with the new price list and loan-free
  path) — no real money, nothing to register.
* **B) Donation link with no in-game power** — a "support the keep" button that
  opens your own payment page; cosmetic thanks only. Needs only a URL from you.
* **C) Real purchases of diamonds** via Stripe Checkout + webhook, then a house
  can be bought with diamonds. Needs your Stripe account, a webhook secret, and
  Play Billing if the Android app is published with it.

Until you choose, the house is bought with gold earned in the world — which is
already possible today (see §2).

---

## Tests and checks

* New `tests/fairness-and-access-v770.test.mjs` — **14 tests**: locked-door
  sound, house prices/routes/purchase/shortfall/unknown city, mercy cap, boss
  cap, swing cap, fairness command, adven catch-up, past doors still telling
  their story.
* `npm run ui:audit` — 139 controls wired, 0 unhandled commands.
* `npm run validate` (text audit + UI audit + audio + world) — PASS.
* Full suite: **775 tests, 774 pass, 0 fail, 1 skipped**.
