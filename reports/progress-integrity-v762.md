# Refresh-safe blessings and palace quests — 7.62.0

Release **7.62.0**. This round fixes three reports from play:

1. after a refresh the palace quest was handed out again;
2. the lasting blessing and the same day's blessing could be received again after a refresh or a version update;
3. it was hard to tell whether the device was still signed in with Google.

## Root cause of 1 and 2

`Game.init()` resumes a game with `autoResumeIfActive()`. That function copied
seven fields by hand (`player`, `location`, `inventory`, `companions`, `visited`,
`kills`, `activeHeroId`) and then entered the room. It never called
`continueGame()`, so it skipped every restore hook:

* `state.sacred` — which holds `permanentTempleBlessing`, `dailyBattleBlessing`,
  `lastTemporaryPrayer`, `firstPrayerDone` and `palace` (accepted/completed
  palace quests);
* `state.quests`, `state.completedQuests`, `state.slainEnemies`;
* `quest-progress-ledger-v760.js` (its restore and its palace ledger);
* every other module that restores its own slice in `continueGame`.

`enterLocation()` then saved the hero, so that half-empty snapshot replaced the
real one in the roster. The lasting blessing was offered again, the daily
blessing could be granted again, and pressing **Palace Quest** found no accepted
quest, so the King gave the first quest again. It happened on every page load,
every service-worker update and every Google sign-in — exactly as reported.

`autoResumeIfActive()` now resumes through `continueGame()`, the same loader the
Continue button uses, and only re-enters the room if the saved room differs.

## Also fixed

* **Daily blessing rule** (`survival-v755.js`): a blessing that is still
  standing is proof it was granted. A snapshot that lost
  `lastTemporaryPrayer` but kept `dailyBattleBlessing` no longer grants a second
  blessing. The fifteen-minute Battle Prayer guard is not mistaken for the
  daily blessing.
* **Durable blessing record** (`progress-guards-v762.js`): the device keeps a
  small append-only record of the lasting blessing, the daily blessing and the
  first-prayer flag, keyed by hero id **and** hero name. It is restored into
  `sacred` before prayer answers, so a snapshot that lost `sacred` cannot hand
  out a second lasting blessing.
* **Palace history by hero name**: the v7.60 ledger is keyed by hero id. A Google
  merge can change that id, which made the ledger invisible. A name-keyed mirror
  now unions the completed list and the accepted quest back before Palace Quest
  answers.
* **Cloud merge unions progress** (`OnlineSystem.mergeNewestRoster`): for the
  same hero (same id, or same unique hero name after an id change) the merge now
  unions palace history, blessing records, quests and completed quests instead of
  letting one snapshot erase the other. A completed quest is never restored as
  accepted. The repaired roster is written back.
* **Account clarity** (`online.js`): the Settings Account row is no longer
  hidden after sign-in. It reads `Google account — <email>` when linked and
  `Guest account — not linked to Google (heroes stay on this device)` otherwise.
  The Google button stays hidden while sign-in is being restored, so a linked
  player no longer sees “Continue with Google” flash on a reload.

Nothing here applies a blessing's stat a second time. A recorded blessing is
only ever restored into state, never re-applied.

## Tests

`tests/progress-integrity-v762.test.mjs` — 9 tests:

* a refresh keeps the lasting blessing and does not add its stat again;
* a refresh keeps the accepted palace quest (and pressing Palace Quest reports
  it instead of accepting it again);
* a refresh does not re-grant the lasting or the daily blessing;
* a stale cloud row cannot erase the accepted quest or the blessing;
* a completed quest cannot come back as accepted;
* a hero whose slot id changed keeps its palace history by name;
* a blessing restored without its timestamp still blocks a second blessing that
  day;
* the save carries the blessing record and the palace history by name;
* Settings show the real Google account.

Two of these tests (the refresh ones) fail on 7.61.0 and pass here.

## Verification by hand

1. Settings → Version shows **7.62.0**.
2. At the Grand Temple: pray once, choose the lasting blessing, note STR/HP.
3. Refresh the page (or let a new version load). Pray again: the lasting
   blessing is not offered, the day's blessing says it is already with you, and
   STR/HP did not change a second time.
4. Accept a palace quest, refresh, press **Palace Quest**: it reports the quest
   you are on. Finish it, refresh, press again: the next quest is offered, never
   the finished one.
5. Settings → Account reads `Google account — your@email` when signed in, or
   `Guest account — not linked to Google` otherwise.
