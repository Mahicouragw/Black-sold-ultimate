/** v22 — Horse racing at the stables, Alexa-Black-Sword style.
 *  Commands (typed into the command box):
 *    "race"            — list today's 4 horses with live odds
 *    "race rules"      — quick how-to
 *    "race 2 50"       — 50 gold on horse #2 (bet 5–500 gold)
 *  The whole race is narrated for TalkBack: parade, off they go, position
 *  beats, and the finish. Win pays bet × odds. Pure luck, fully fair.
 */
(function () {
  const HORSES = [
    { name: 'Thunderhoof', quirk: 'explosive starter' },
    { name: 'Shadowmane', quirk: 'patient closer' },
    { name: 'Swiftwind', quirk: 'featherlight sprinter' },
    { name: 'Goldenbuck', quirk: 'stubborn stayer' }
  ];
  let inRace = false;
  let todaysOdds = null;

  const G = () => window.Game;
  const say = (t, kind) => G()?.addNarrative?.(t, kind || 'system');
  const sfx = (n) => { try { window.MusicSystem?.playSFX?.(n); } catch {} };
  const rolledOdds = () => Math.round((1.6 + Math.random() * 2.4) * 10) / 10;
  const ensureOdds = () => { if (!todaysOdds || todaysOdds.length !== 4) todaysOdds = HORSES.map(rolledOdds); return todaysOdds; };

  function listRace() {
    const p = G().state.player;
    const o = ensureOdds();
    sfx('turn');
    say(`🏇 The stables trumpet! Four horses parade for the next sprint: ${HORSES.map((h, i) => `${i + 1}. ${h.name} — odds ${o[i]} times (${h.quirk})`).join('; ')}. Type "race [1-4] [gold bet]" — for example, race 2 50. You carry ${p?.gold ?? 0} gold.`, 'location');
  }

  function rules() {
    say('Horse racing: four horses, pick one, bet 5 to 500 gold. If your horse wins you receive bet times its odds. Every race reshuffles the odds. All luck, all fair.', 'system');
  }

  function ordinal(n) { return `${n}${['th', 'st', 'nd', 'rd'][Math.min(n, 4) === 0 ? 0 : Math.min(n, 4)] || 'th'}`; }

  // Jeweller's exchange — rubies are RARE treasure; the only way to buy one
  // is with diamonds (1💎 → 1🔴 ruby, 5💎 → 1🟡 gold ruby). By design.
  function exchangeDiamonds(command) {
    const game = G();
    const p = game.state.player;
    if (!p) { say('Create a hero first.', 'system'); return; }
    const goldRuby = command.includes('gold');
    const cost = goldRuby ? 5 : 1;
    const key = goldRuby ? 'goldRubies' : 'rubies';
    if ((p.diamonds || 0) < cost) {
      sfx('button');
      say(`The jeweller shakes her head: a ${goldRuby ? 'gold ruby 🟡' : 'ruby 🔴'} costs ${cost} diamond${cost > 1 ? 's' : ''} 💎, and you carry ${p.diamonds || 0}.`, 'system');
      return;
    }
    p.diamonds -= cost;
    p[key] = (p[key] || 0) + 1;
    sfx('treasure');
    say(`💎➜${goldRuby ? '🟡' : '🔴'} The jeweller smiles and hands you 1 ${goldRuby ? 'gold ruby' : 'ruby'}. You now carry 🔴 ${p.rubies || 0} rubies, 🟡 ${p.goldRubies || 0} gold rubies and 💎 ${p.diamonds} diamonds.`, 'treasure');
    game.updateHUD?.();
    game.save?.();
  }

  function startRace(pick, bet) {
    const game = G();
    const p = game.state.player;
    if (!p) { say('Create a hero first.', 'system'); return; }
    if (inRace) { say('A race is already thundering down the track — wait for the finish!', 'system'); return; }
    if (!(pick >= 1 && pick <= 4)) { say('Pick horse 1, 2, 3 or 4. Type "race" to see the lineup.', 'system'); return; }
    if (!bet || bet < 5) { say('Minimum bet is 5 gold. Example: race 2 50.', 'system'); return; }
    bet = Math.min(500, Math.floor(bet));
    if ((p.gold || 0) < bet) { say(`You need ${bet} gold for that bet — you carry ${p.gold || 0}.`, 'system'); return; }

    const o = ensureOdds();
    p.gold -= bet;
    game.updateHUD?.();
    game.save?.();
    inRace = true;
    sfx('horse');
    say(`🏇 ${bet} gold rides on ${HORSES[pick - 1].name} at odds ${o[pick - 1]}. The gates spring open… AND THEY'RE OFF!`, 'treasure');

    const runners = HORSES.map((h, i) => ({ i, pace: 0 }));
    const beats = [
      `${HORSES[0].name} bursts from the gate!`,
      `Down the back stretch, hooves drumming!`,
      `Around the final turn — the crowd roars!`
    ];
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      runners.forEach(r => { r.pace += Math.random() * 3; });
      const order = [...runners].sort((a, b) => b.pace - a.pace);
      if (tick <= 3) {
        sfx('horse');
        say(`${beats[tick - 1]} ${HORSES[order[0].i].name} leads, ${HORSES[order[1].i].name} pressing hard…`, 'combat');
        return;
      }
      clearInterval(timer);
      inRace = false;
      todaysOdds = null; // fresh odds for the next race
      const winnerIdx = order[0].i;
      const myPlace = order.findIndex(r => r.i === pick - 1) + 1;
      if (winnerIdx === pick - 1) {
        const payout = Math.floor(bet * o[pick - 1]);
        p.gold += payout;
        sfx('win');
        say(`🏁 ${HORSES[winnerIdx].name} WINS the sprint! Your ${bet} gold becomes ${payout} gold! You now carry ${p.gold} gold.`, 'treasure');
      } else {
        sfx('lose');
        say(`🏁 ${HORSES[winnerIdx].name} takes the purse. ${HORSES[pick - 1].name} runs ${ordinal(myPlace)} — the stables keep your ${bet} gold. You have ${p.gold} gold left.`, 'system');
      }
      game.updateHUD?.();
      game.save?.();
    }, 1500);
  }

  function wrap() {
    const game = G();
    if (!game || game._horseRaceWrapped) return;
    game._horseRaceWrapped = true;
    const previous = game.processCommand.bind(game);
    game.processCommand = function (raw) {
      const c = String(raw || '').trim().toLowerCase();
      if (c === 'race' || c === 'horse race' || c === 'races' || c === 'stables') { listRace(); return; }
      if (c === 'race rules') { rules(); return; }
      const m = c.match(/^race\s+([1-4])\s+(\d+)$/);
      if (m) { startRace(parseInt(m[1], 10), parseInt(m[2], 10)); return; }
      if (c === 'buy ruby' || c === 'buy a ruby' || c === 'buy gold ruby' || c === 'buy a gold ruby' || c === 'exchange diamonds') { exchangeDiamonds(c); return; }
      previous(raw);
    };
    console.log('🏇 v22 horse racing loaded: 4 horses, live odds, narrated sprints — fair by design.');
  }

  const boot = () => (G() ? wrap() : setTimeout(boot, 300));
  boot();
})();
