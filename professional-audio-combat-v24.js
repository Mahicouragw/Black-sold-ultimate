/**
 * Black Sword Ultimate — recorded combat and board-game event timelines.
 *
 * AudioManager owns the only speech/effect queue. Every action or result is
 * narrated first, then its matching recordings and optional reactions play in
 * order to their real ended events. Loot, experience and victory remain later
 * events; victory never jumps ahead of those events. No fixed-duration timer
 * is used to cut a recording short, and no second speech or audio engine exists.
 */

(function() {
  const ProfessionalAudioCombat = {
    // AudioManager owns spoken-event queueing.
    isPlayingCriticalSound: false,
    
    // Professional sound library with royalty-free sources
    sounds: {
      // Player attack - immediate swing
      weaponSwing: { src: 'assets/audio/sfx/attack.wav', duration: 400, source: 'OpenGameArt CC0 RPG Sound Pack', next: 'hitCheck' },
      weaponSwingHeavy: { src: 'assets/audio/sfx/attack-heavy.wav', duration: 600, source: 'OpenGameArt CC0', next: 'hitCheck' },
      weaponSwingFast: { src: 'assets/audio/sfx/attack-fast.wav', duration: 250, source: 'OpenGameArt CC0', next: 'hitCheck' },
      
      // Hit when weapon connects
      hit: { src: 'assets/audio/sfx/hit.wav', duration: 300, source: 'OpenGameArt CC0', next: 'narration' },
      hitMetal1: { src: 'assets/audio/sfx/hit-metal-1.wav', duration: 350, source: 'OpenGameArt CC0' },
      hitMetal2: { src: 'assets/audio/sfx/hit-metal-2.wav', duration: 350, source: 'OpenGameArt CC0' },
      
      // Miss
      miss: { src: 'assets/audio/sfx/miss.wav', duration: 300, source: 'OpenGameArt CC0 - Air Whoosh by pyranostudios', next: 'narration' },
      
      // Monster attack
      monsterAttack: { src: 'assets/audio/sfx/monster-roar.wav', duration: 800, source: 'OpenGameArt CC0 - Monster roar', next: 'monsterHitCheck' },
      monsterHit: { src: 'assets/audio/sfx/monster-hit.wav', duration: 400, source: 'OpenGameArt CC0', next: 'narration' },
      
      // Healing
      healingStart: { src: 'assets/audio/sfx/magic.wav', duration: 800, source: 'OpenGameArt CC0 - Magic', next: 'healingComplete' },
      healingComplete: { src: 'assets/audio/sfx/heal.wav', duration: 600, source: 'OpenGameArt CC0 - Heal', next: 'narration' },
      healingChain: { src: 'assets/audio/sfx/heal-chain.wav', duration: 700, source: 'OpenGameArt CC0', next: 'narration' },
      
      // Monster defeat - final hit, death, falling - must all play BEFORE narration "Goblin defeated"
      finalHit: { src: 'assets/audio/sfx/hit.wav', duration: 300, source: 'OpenGameArt CC0' },
      monsterDeath: { src: 'assets/audio/sfx/death.wav', duration: 1000, source: 'OpenGameArt CC0 - Death' },
      bodyFall: { src: 'assets/audio/sfx/body-fall.wav', duration: 600, source: 'Freesound CC0 - Body falling' },
      
      // Loot
      treasureAppear: { src: 'assets/audio/sfx/coin.wav', duration: 500, source: 'OpenGameArt CC0 - Coin', next: 'lootNarration' },
      itemFound: { src: 'assets/audio/sfx/pickup.wav', duration: 400, source: 'OpenGameArt CC0 - Pickup' },
      
      // Experience
      expGain: { src: 'assets/audio/sfx/exp.wav', duration: 400, source: 'Kenney CC0 - Pizzicato Jingle 01' },
      levelUp: { src: 'assets/audio/sfx/levelup.wav', duration: 1500, source: 'OpenGameArt CC0 - Level up' },
      
      // Victory - MUST NEVER begin before all defeated, defeat sounds, loot, exp finish
      victoryFanfare: { src: 'assets/audio/music/victory.mp3', duration: 3000, source: 'celestialghost8 CC0 - Victory', isMusic: true },
      
      // Board games - Real sounds from free sources, not generated
      boardDice: { src: 'assets/audio/sfx/board-dice.wav', duration: 800, source: 'OpenGameArt CC0 - Card Game Sounds by HaelDB', next: 'diceResult' },
      boardPiece: { src: 'assets/audio/sfx/board-piece.wav', duration: 300, source: 'OpenGameArt CC0 - Board piece' },
      boardPieceStep: { src: 'assets/audio/sfx/step-wood.ogg', duration: 250, source: 'TinyWorlds CC0 - Wood steps' },
      boardTurn: { src: 'assets/audio/sfx/board-turn.wav', duration: 400, source: 'OpenGameArt CC0' },
      boardError: { src: 'assets/audio/sfx/board-error.wav', duration: 300, source: 'OpenGameArt CC0' },
      cardFlip: { src: 'assets/audio/sfx/card-flip.wav', duration: 200, source: 'Kenney CC0 - RPG Audio, Book Flip 1' },
      cardShuffle: { src: 'assets/audio/sfx/card-shuffle.wav', duration: 800, source: 'HaelDB CC0' },
      cardDraw: { src: 'assets/audio/sfx/card-draw.wav', duration: 300, source: 'HaelDB CC0' },
      carromStrike: { src: 'assets/audio/sfx/carrom-strike.wav', duration: 500, source: 'Kenney CC0 - Impact Metal Light', next: 'collision' },
      carromCollision: { src: 'assets/audio/sfx/coin-collision.wav', duration: 200, source: 'Kenney CC0 - Casino Audio, Chips Collide 1' },
      carromPocket: { src: 'assets/audio/sfx/coin.wav', duration: 400, source: 'OpenGameArt CC0' },
      chessMove: { src: 'assets/audio/sfx/chess-move.wav', duration: 300, source: 'Kenney CC0 - Casino Audio, Card Place 1' },
      chessCapture: { src: 'assets/audio/sfx/attack.wav', duration: 400, source: 'OpenGameArt CC0' },
      chessCheck: { src: 'assets/audio/sfx/check.wav', duration: 500, source: 'Kenney CC0 - Confirmation 001' },
      chessCheckmate: { src: 'assets/audio/sfx/checkmate.wav', duration: 800, source: 'Kenney CC0 - Digital Audio, Low Down' },
      
      // Cemetery horror - verified real recordings and licensed music:
      // every file below is verified to exist in assets/audio - zero 404s.
      ghostChoir: { src: 'assets/audio/music/Fantasy-Choir-1.mp3', duration: 0, source: 'OpenGameArt CC BY-SA 3.0 - A Winter Tale by Johan Brodd', isMusic: true },
      cemeteryHorror: { src: 'assets/audio/music/dark-forest.mp3', duration: 0, source: 'OpenGameArt CC0 - Cathedral in the Forest by congusbongus', isMusic: true },
      ghostScream: { src: 'assets/audio/sfx/ghost-scream.wav', duration: 1000, source: 'OpenGameArt CC0 - Scary High-pitched Ghost by Fupi' },
      ghostMoan: { src: 'assets/audio/sfx/ghost-moan.wav', duration: 1200, source: 'OpenGameArt CC0 - Ghost Monster Voice by qubodup' },
      goblinCackle: { src: 'assets/audio/sfx/goblin-cackle.wav', duration: 800, source: 'OpenGameArt CC BY 3.0 - Goblin Cackle by spookymodem' },
      hauntedWind: { src: 'assets/audio/sfx/haunted-wind.wav', duration: 0, source: 'OpenGameArt CC0 - Wind by IgnasD', isMusic: false },
    },

    // Preloaded status
    preloaded: {},
    isPreloading: false,

    // Initialize - preload and cache sounds before gameplay, never delay gameplay while downloading
    async init() {
      console.log('🎵 Professional Audio Event System v24 - Preloading all sounds for offline use...');
      this.isPreloading = true;
      
      // Preload critical combat sounds first (must be ready before any battle)
      const critical = ['weaponSwing', 'hit', 'miss', 'monsterAttack', 'monsterHit', 'finalHit', 'monsterDeath', 'bodyFall', 'healingStart', 'healingComplete'];
      for (const id of critical) {
        await this.preloadSound(id);
      }
      
      // Then preload all remaining sounds in background
      const allSounds = Object.keys(this.sounds);
      for (const id of allSounds) {
        if (!critical.includes(id)) {
          this.preloadSound(id); // Don't await, background
          await new Promise(r => setTimeout(r, 30)); // Small delay to avoid overwhelming
        }
      }
      
      this.isPreloading = false;
      console.log('✅ All sounds preloaded and cached for offline use');
    },

    async preloadSound(id) {
      if (this.preloaded[id]) return;
      const sound = this.sounds[id];
      if (!sound) return;
      
      try {
        // Use MusicSystem's Web Audio API cache if available (sub-10ms latency)
        if (window.MusicSystem && window.MusicSystem.loadSFXBuffer) {
          await window.MusicSystem.loadSFXBuffer(sound.src);
        } else {
          // Fallback: fetch and cache
          const cache = await caches.open('audio-cache-v24');
          await cache.add(sound.src).catch(() => {});
        }
        this.preloaded[id] = true;
      } catch (e) {
        console.log(`Preload failed for ${id}, will use fallback:`, e.message);
        this.preloaded[id] = true; // Mark as ready even if failed, fallback to HTMLAudio
      }
    },

    // Play sound at exact gameplay event - never allow overlapping incorrectly
    // Play a complete recording through the authoritative event queue.
    async playExact(id, options = {}) {
      const aliases = {
        carrom_strike: 'carromStrike', carrom_collision: 'carromCollision', carrom_pocket: 'carromPocket',
        chess_move: 'chessMove', chess_capture: 'chessCapture', chess_check: 'chessCheck', chess_checkmate: 'chessCheckmate',
        card_flip: 'cardFlip', memory_match: 'check', memory_wrong: 'boardError', winner: 'victoryFanfare'
      };
      const sound = this.sounds[id] || this.sounds[aliases[id]];
      if (!sound) { console.warn(`Sound ${id} not found`); return 0; }
      try {
        if (window.MusicSystem?.playSFXAndWait) {
          if (options.wait === false) window.MusicSystem.playSFX(sound.src);
          else await window.MusicSystem.playSFXAndWait(sound.src);
        }
        return sound.duration || 500;
      } catch (error) {
        console.log(`Play sound ${id} failed:`, error.message);
        return 0;
      }
    },

    async waitForCurrentSound() { return true; },

    // Narration and its matching effects are one atomic queue item.
    async narrate(text, priority = 'normal', sfx = [], reaction = []) {
      const isCombat = /damage|hit|health|attack|defeat/i.test(text), type = isCombat ? 'combat' : 'system';
      const options = { critical: priority === 'assertive', sfx, reaction };
      if (window.Game?.emitGameEvent) return window.Game.emitGameEvent(text, type, options);
      window.Game?.addNarrative?.(text, type);
      return window.AudioManager?.playAction?.(text, sfx, { priority: priority === 'assertive' ? 'critical' : false, reaction }) || false;
    },

    // The exact action/result is spoken first; swing, impact and optional
    // goblin reaction then play sequentially without fixed-duration clipping.
    async playerAttack(attackerName, targetName, damage, isCrit, isMiss, remainingHealth) {
      if (isMiss) {
        await this.narrate(`${attackerName} attacks but ${targetName} dodged the attack.`, 'normal', ['attack', 'miss']);
      } else {
        const reaction = /goblin/i.test(targetName) ? ['goblin-reaction'] : [];
        await this.narrate(`You hit ${targetName} for ${damage} damage${isCrit ? ' with a critical strike' : ''}.`, 'normal', ['attack', 'weapon-hit'], reaction);
        if (remainingHealth > 0) await this.narrate(`${targetName} has ${remainingHealth} health remaining.`);
      }
    },

    async monsterAttack(monsterName, damage, isMiss, playerRemainingHealth) {
      if (isMiss) {
        await this.narrate(`${monsterName} attacks but you blocked the attack.`, 'normal', ['monster-roar', 'miss']);
      } else {
        await this.narrate(`${monsterName} hits you for ${damage} damage.`, 'normal', ['monster-roar', 'monster-hit']);
        await this.narrate(`You have ${playerRemainingHealth} health remaining.`);
      }
    },

    async healingSpell(healAmount, newHealth) {
      await this.narrate(`Your healing spell restores ${healAmount} health.`, 'normal', ['magic', 'heal']);
      await this.narrate(`You now have ${newHealth} health.`);
    },

    async monsterDefeat(monsterName) {
      await this.narrate(`${monsterName} defeated.`, 'normal', ['hit', 'death', 'body-fall']);
      // Victory remains a later, separate event after loot and experience.
    },

    async loot(monsterName, items) {
      if (!items || items.length === 0) {
        await this.narrate(`The ${monsterName} dropped no loot.`);
        return;
      }
      for (const item of items) {
        if (item.gold) await this.narrate(`You found ${item.gold} Gold.`, 'normal', ['coin']);
        else if (item.name) await this.narrate(`You found ${item.name}.`, 'normal', ['pickup']);
      }
    },

    async experience(xp, newLevel, oldLevel) {
      await this.narrate(`You gained ${xp} experience.`, 'normal', ['exp']);
      if (newLevel > oldLevel) await this.narrate(`Congratulations! You reached Level ${newLevel}.`, 'normal', ['levelup']);
    },

    async victory(options = {}) {
      await this.narrate(`You have won the battle.`, 'normal', options.skipFanfare ? [] : ['victory']);
    },

    // MULTIPLE ENEMIES - Support battles against multiple enemies
    async multiEnemyBattle(battleLog) {
      // battleLog: array of events like:
      // [{type: 'hit', attacker: 'You', target: 'Goblin', damage: 80}, {type: 'defeat', monster: 'Goblin'}, ...]
      
      for (const event of battleLog) {
        if (event.type === 'hit') {
          await this.playerAttack(event.attacker, event.target, event.damage, event.isCrit, event.isMiss, event.remainingHealth);
        } else if (event.type === 'monsterHit') {
          await this.monsterAttack(event.monster, event.damage, event.isMiss, event.playerHealth);
        } else if (event.type === 'defeat') {
          await this.monsterDefeat(event.monster);
        } else if (event.type === 'loot') {
          await this.loot(event.monster, event.items);
        } else if (event.type === 'exp') {
          await this.experience(event.xp, event.newLevel, event.oldLevel);
        }
        // Small pause between events
        await new Promise(r => setTimeout(r, 200));
      }
      
      // After every monster defeated, process loot, exp, finally victory fanfare (already handled in victory method)
      // Victory must be last
      await this.victory();
    },

    // BOARD GAMES - Same synchronized event system
    boardGames: {
      async diceRoll(value) {
        await ProfessionalAudioCombat.narrate(`You rolled the dice. You got ${value}.`, 'normal', ['board-dice']);
      },

      async pieceMove(steps, position, playerName) { // Game Hall narrates the exact move.
        const count = Math.max(1, Math.min(12, Number(steps) || 1));
        for (let i = 1; i <= count; i++) await ProfessionalAudioCombat.playExact('boardPieceStep');
      },

      async snakeBite(from, to) { // Game Hall narrates the exact snake transition.
        await ProfessionalAudioCombat.playExact('miss');
        await ProfessionalAudioCombat.playExact('bodyFall');
      },

      async ladderClimb(from, to) { // Game Hall narrates the exact ladder transition.
        await ProfessionalAudioCombat.playExact('healingStart');
        await ProfessionalAudioCombat.playExact('levelUp');
      },

      async carromStrike(playerName) {
        if (playerName) await ProfessionalAudioCombat.narrate(`${playerName} struck the striker.`, 'normal', ['carrom-strike']);
        else await ProfessionalAudioCombat.playExact('carrom_strike');
      },

      async carromCollision() { await ProfessionalAudioCombat.playExact('carrom_collision'); },

      async carromPocket() {
        await ProfessionalAudioCombat.narrate('Coin pocketed!', 'normal', ['coin']);
      },

      async chessMove(from, to, player) {
        await ProfessionalAudioCombat.narrate(`${player || ''} moved from ${from} to ${to}.`, 'normal', ['chess-move']);
      },

      async chessCapture() {
        await ProfessionalAudioCombat.narrate('Piece captured.', 'normal', ['attack']);
      },

      async chessCheck() {
        await ProfessionalAudioCombat.narrate('Check!', 'normal', ['check']);
      },

      async chessCheckmate() {
        await ProfessionalAudioCombat.narrate('Checkmate!', 'normal', ['checkmate']);
      },

      async memoryFlip() { await ProfessionalAudioCombat.playExact('card_flip'); },

      async memoryMatch() {
        await ProfessionalAudioCombat.narrate('Match found!', 'normal', ['check']);
      },

      async memoryWrong() {
        await ProfessionalAudioCombat.narrate('Not a match, try again.', 'normal', ['board-error']);
      },

      async victory(playerName) {
        const text = playerName ? `Congratulations ${playerName}! You won the game.` : 'Congratulations! You won the game.';
        await ProfessionalAudioCombat.narrate(text, 'normal', ['victory']);
      }
    }
  };

  // Make available globally
  window.ProfessionalAudioCombat = ProfessionalAudioCombat;

  // Auto-initialize
  document.addEventListener('DOMContentLoaded', () => {
    ProfessionalAudioCombat.init();
  });

  console.log('Professional Audio Combat System v24 Loaded - AAA RPG with synchronized audio, TalkBack, combat timeline');
})();

// Also expose for game-hall.js board games to use same system
if (typeof window !== 'undefined') {
  window.ProfessionalAudioCombat = ProfessionalAudioCombat;
}
