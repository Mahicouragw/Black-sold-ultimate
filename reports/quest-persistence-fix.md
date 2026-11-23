# Palace quest repeats after a reload, a deploy or a Google sign-in — fixed in 7.60.0

## What the player saw

> "I already finished the first quest. I went to the palace, asked for the
> request, and it gave me the first quest again — also when I refresh the page,
> and when a new version was deployed."

## Why it happened

Palace quests are stored in `Game.state.sacred.palace` (`active`, `completed`).
That object travels inside the hero save, so the *local* save was correct. Two
paths could still hand out the same first quest again:

1. **A cloud restore replaced the device save wholesale.** After a Google
   sign-in — and Supabase keeps the session, so this also runs after a refresh or
   a deploy-triggered reload — `OnlineSystem.restoreRosterFromCloud()` wrote the
   cloud roster over the local one with no comparison. If the newest local
   progress had not finished uploading (a reload during the save, a short
   network drop, a deploy that reloads the page), the cloud row was older than
   the device, `sacred.palace.completed` came back empty, and
   `Game.palaceQuest()` correctly offered the first unresolved quest in the
   catalogue: the first quest again.
2. **No durable record of quest history existed outside that one object.** A
   save snapshot taken before the quest existed, a wiped `sacred` block or a
   legacy cloud row (written by 7.59 and older, without `savedAt`) had nothing to
   fall back on.

Nothing was deleted from the database or the saves; the progress simply was not
merged back.

## The fix

* **Per-hero `savedAt` timestamp** in every hero save (`game.js`).
* **`quest-progress-ledger-v760.js`** — an append-only device ledger of completed
  palace quests and the accepted quest with the highest progress ever reached.
  It is written the moment progress changes (`checkQuests`, `palaceQuest`), on
  save, and on `pagehide` / a hidden tab; it is unioned back on every load, so a
  completed quest can never be re-issued. The ledger is also saved inside the
  hero data (`palaceLedger`), so a fresh device can recover it.
* **`OnlineSystem.mergeNewestRoster()`** — cloud and device rosters are now
  reconciled per hero: the newer `savedAt` wins, an empty cloud row never erases
  device heroes, an account never silently absorbs unrelated device slots, and
  the repaired roster is written back to the cloud. The same reconciliation is
  used by `restoreRosterFromCloud()` (login/refresh) and `cacheCloudSave()`.

## How the player can verify it

1. Open the game, go to the Royal Palace, say/type **palace quest** and finish
   that quest (or reach any quest progress).
2. Refresh the page (F5 / pull to refresh), or wait for the next deploy and
   reload.
3. Enter the palace and ask again:
   * the quest you accepted continues with its progress if it is unfinished, or
   * the next palace quest is offered if it was finished.
   It never restarts from the first quest.
4. Sign in with Google on the same browser: the same is true, because the newer
   snapshot wins.

Automated proof: `tests/quest-persistence-v760.test.mjs` (16 tests) covers the
reload path, three consecutive reloads, a stale/legacy cloud row, a wiped sacred
block, kill-time progress, `pagehide` flushing, per-hero isolation and the cloud
merge rules.
