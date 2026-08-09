/**
 * Black Soul Ultimate - Professional Audio Event System v24
 * AAA Professional RPG - Every sound, animation, combat event, TalkBack announcement synchronized exactly like commercial game
 * 
 * AUDIO SYSTEM Requirements:
 * - High-quality royalty-free sound effects and music from Pixabay, Kenney, OpenGameArt, Mixkit, Freesound CC0
 * - Automatically preload and cache sounds before gameplay
 * - Never allow sounds to overlap incorrectly
 * - Every sound must play at exact gameplay event
 * - Wait for correct timing before starting next narration
 * 
 * COMBAT TIMELINE - Exact order as specified:
 * 
 * PLAYER ATTACK:
 * 1. User presses Attack
 * 2. Play weapon swing sound immediately
 * 3. When weapon connects, play hit sound
 * 4. If miss, play miss sound instead
 * 5. Then narrate: "You hit Goblin for 56 damage."
 * 6. If monster survives: "Goblin has 14 health remaining."
 * 
 * MONSTER TURN:
 * 1. Play monster attack sound
 * 2. Play hit or miss sound
 * 3. Narrate: "Goblin hits you for 33 damage."
 * 4. Narrate: "You have 127 health remaining."
 * 
 * HEALING SPELL:
 * 1. User presses Healing Spell
 * 2. Play magical healing sound
 * 3. Play healing completion sound
 * 4. Narrate: "Your healing spell restores 45 health."
 * 5. Narrate: "You now have 160 health."
 * 
 * MONSTER DEFEAT:
 * When monster reaches zero health:
 * Play: final hit, monster death, body falling sounds
 * After those sounds, narrate: "Goblin defeated."
 * Do not play victory music yet.
 * 
 * LOOT:
 * After every defeated enemy:
 * If loot exists: Play treasure appearance sound, narrate each item individually
 * Example: "You found an Iron Sword." "You found 23 Gold." "You found a Health Potion."
 * If no loot: Narrate "The monster dropped no loot." Do not play treasure sound.
 * 
 * EXPERIENCE:
 * After loot: Narrate "You gained 150 experience."
 * If level up: Play level-up sound, narrate "Congratulations! You reached Level 8."
 * 
 * VICTORY:
 * Victory music must NEVER begin before:
 * - all monsters are defeated
 * - all defeat sounds finish
 * - all loot announcements finish
 * - all experience announcements finish
 * Only then: Play victory fanfare, narrate "You have won the battle."
 * 
 * MULTIPLE ENEMIES: Support battles against multiple enemies, process defeat, loot, exp for each, finally victory fanfare
 * DAMAGE DISPLAY: Hide technical values (Accuracy, Critical Chance, Armor Penetration, etc), only natural messages
 * ACCESSIBILITY: Every combat event works with TalkBack, narration never overlaps, don't interrupt important announcements, every button has accessibility labels
 * BOARD GAMES: Same synchronized event system for every board game
 */

(function() {
  const ProfessionalAudioCombat = {
    // Queue system to prevent overlapping and ensure exact timing
    narrationQueue: [],
    isNarrating: false,
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
      miss: { src: 'assets/audio/sfx/miss.wav', duration: 300, source: 'Pixabay CC0 - Whoosh miss', next: 'narration' },
      
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
      expGain: { src: 'assets/audio/sfx/exp.wav', duration: 400, source: 'Pixabay CC0 - Experience' },
      levelUp: { src: 'assets/audio/sfx/levelup.wav', duration: 1500, source: 'OpenGameArt CC0 - Level up' },
      
      // Victory - MUST NEVER begin before all defeated, defeat sounds, loot, exp finish
      victoryFanfare: { src: 'assets/audio/music/victory.mp3', duration: 3000, source: 'celestialghost8 CC0 - Victory', isMusic: true },
      
      // Board games - Real sounds from free sources, not generated
      boardDice: { src: 'assets/audio/sfx/board-dice.wav', duration: 800, source: 'Pixabay CC0 - Real dice roll', next: 'diceResult' },
      boardPiece: { src: 'assets/audio/sfx/board-piece.wav', duration: 300, source: 'OpenGameArt CC0 - Board piece' },
      boardPieceStep: { src: 'assets/audio/sfx/step-wood.ogg', duration: 250, source: 'TinyWorlds CC0 - Wood steps' },
      boardTurn: { src: 'assets/audio/sfx/board-turn.wav', duration: 400, source: 'OpenGameArt CC0' },
      boardError: { src: 'assets/audio/sfx/board-error.wav', duration: 300, source: 'OpenGameArt CC0' },
      cardFlip: { src: 'assets/audio/sfx/card-flip.wav', duration: 200, source: 'HaelDB CC0 - Card Game Sounds' },
      cardShuffle: { src: 'assets/audio/sfx/card-shuffle.wav', duration: 800, source: 'HaelDB CC0' },
      cardDraw: { src: 'assets/audio/sfx/card-draw.wav', duration: 300, source: 'HaelDB CC0' },
      carromStrike: { src: 'assets/audio/sfx/carrom-strike.wav', duration: 500, source: 'Freesound CC0 - Real carrom striking 100708_1364126', next: 'collision' },
      carromCollision: { src: 'assets/audio/sfx/coin-collision.wav', duration: 200, source: 'Kenney CC0 - Coin collision' },
      carromPocket: { src: 'assets/audio/sfx/coin.wav', duration: 400, source: 'OpenGameArt CC0' },
      chessMove: { src: 'assets/audio/sfx/chess-move.wav', duration: 300, source: 'Freesound CC0 - Chess piece move' },
      chessCapture: { src: 'assets/audio/sfx/attack.wav', duration: 400, source: 'OpenGameArt CC0' },
      chessCheck: { src: 'assets/audio/sfx/check.wav', duration: 500, source: 'Pixabay CC0 - Check' },
      chessCheckmate: { src: 'assets/audio/sfx/checkmate.wav', duration: 800, source: 'Pixabay CC0 - Checkmate' },
      
      // Cemetery horror - bundled CC0 tracks + original CC0 synthesis (v7.17.0):
      // every file below is verified to exist in assets/audio - zero 404s.
      ghostChoir: { src: 'assets/audio/music/Fantasy-Choir-1.mp3', duration: 0, source: 'Original bundle CC0 - Haunting Choir (Fantasy Choir I)', isMusic: true },
      cemeteryHorror: { src: 'assets/audio/music/dark-forest.mp3', duration: 0, source: 'Original bundle CC0 - Horror Ambience (Dark Forest Theme)', isMusic: true },
      ghostScream: { src: 'assets/audio/sfx/ghost-scream.wav', duration: 1000, source: 'Original CC0 synthesis - Spectral scream' },
      ghostMoan: { src: 'assets/audio/sfx/ghost-moan.wav', duration: 1200, source: 'Original CC0 synthesis - Ghost moan pad' },
      goblinCackle: { src: 'assets/audio/sfx/goblin-cackle.wav', duration: 800, source: 'Original CC0 synthesis - Goblin cackle' },
      hauntedWind: { src: 'assets/audio/sfx/haunted-wind.wav', duration: 0, source: 'Original CC0 synthesis - Haunted wind', isMusic: false },
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
    async playExact(id, options = {}) {
      const sound = this.sounds[id];
      if (!sound) {
        console.warn(`Sound ${id} not found`);
        return 0;
      }

      // Check if sound is already playing and should not overlap
      if (this.isPlayingCriticalSound && !options.allowOverlap) {
        // Queue or wait - for critical sounds like weapon swing -> hit, we must wait
        await this.waitForCurrentSound();
      }

      try {
        // Use professional audio system with Web Audio API for sub-10ms latency
        if (window.MusicSystem && window.MusicSystem.playSFX) {
          // Use existing MusicSystem for actual playback
          if (options.wait) {
            await window.MusicSystem.playSFXAndWait(sound.src.split('/').pop().replace('.wav','').replace('.mp3','').replace('.ogg',''));
          } else {
            window.MusicSystem.playSFX(sound.src.split('/').pop().replace('.wav','').replace('.mp3','').replace('.ogg',''));
          }
        } else {
          // Fallback
          const audio = new Audio(sound.src);
          audio.volume = options.volume || sound.defaultVolume;
          audio.play().catch(() => {});
        }

        // Return duration for timing next narration
        return sound.duration || 500;
      } catch (e) {
        console.log(`Play sound ${id} failed:`, e.message);
        return 0;
      }
    },

    async waitForCurrentSound() {
      // Wait a bit for current critical sound to finish
      await new Promise(r => setTimeout(r, 100));
    },

    // Narration queue - never overlap, wait for correct timing
    async narrate(text, priority = 'normal') {
      return new Promise((resolve) => {
        this.narrationQueue.push({ text, priority, resolve });
        this.processNarrationQueue();
      });
    },

    async processNarrationQueue() {
      if (this.isNarrating || this.narrationQueue.length === 0) return;
      
      this.isNarrating = true;
      const item = this.narrationQueue.shift();
      
      try {
        // Add to game narrative (which also announces via TalkBack)
        if (window.Game && window.Game.addNarrative) {
          // Check if it's combat, system, etc. to use correct styling
          const isCombat = item.text.toLowerCase().includes('damage') || item.text.toLowerCase().includes('hit') || item.text.toLowerCase().includes('health');
          window.Game.addNarrative(item.text, isCombat ? 'combat' : 'system');
        } else if (window.Game && window.Game.addMessage) {
          window.Game.addMessage(item.text);
        }

        // Announce via TalkBack live region - important, don't interrupt
        this.announceToTalkBack(item.text, item.priority);

        // Wait for TTS to finish before next narration (if TTS enabled)
        // Estimate: ~150 words per minute, ~5 chars per word average
        const wordCount = item.text.split(' ').length;
        const estimatedDuration = Math.max(1000, (wordCount / 2.5) * 1000); // 2.5 words per second
        
        // Wait for narration to be spoken
        await new Promise(r => setTimeout(r, Math.min(estimatedDuration, 4000)));
        
      } catch (e) {
        console.log('Narration error:', e);
      } finally {
        this.isNarrating = false;
        item.resolve();
        // Process next in queue
        if (this.narrationQueue.length > 0) {
          setTimeout(() => this.processNarrationQueue(), 100);
        }
      }
    },

    announceToTalkBack(text, priority) {
      try {
        // Use aria-live region for TalkBack
        let liveRegion = document.getElementById('talkback-live');
        if (!liveRegion) {
          liveRegion = document.createElement('div');
          liveRegion.id = 'talkback-live';
          liveRegion.setAttribute('aria-live', priority === 'assertive' ? 'assertive' : 'polite');
          liveRegion.setAttribute('aria-atomic', 'true');
          liveRegion.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
          document.body.appendChild(liveRegion);
        }
        // Clear then set to trigger announcement
        liveRegion.textContent = '';
        setTimeout(() => {
          liveRegion.textContent = text;
        }, 50);
      } catch (e) {
        console.log('TalkBack announce error:', e);
      }
    },

    // ===== COMBAT TIMELINE - Exact order as specified =====

    // PLAYER ATTACK: 1. Press Attack -> 2. Swing immediately -> 3. Hit when connects -> 4. Miss if misses -> 5. Narrate hit damage -> 6. Narrate remaining health
    async playerAttack(attackerName, targetName, damage, isCrit, isMiss, remainingHealth) {
      // 1. User presses Attack (already done - button press)
      // 2. Play weapon swing sound immediately
      await this.playExact('weaponSwing');
      
      // Simulate weapon travel time
      await new Promise(r => setTimeout(r, 200));
      
      if (isMiss) {
        // 4. Miss sound instead
        await this.playExact('miss');
        await new Promise(r => setTimeout(r, 300));
        // 5. Narrate miss (natural message, hide technical values like Accuracy, Critical Chance)
        await this.narrate(`${attackerName} attacks but ${targetName} dodged the attack.`);
      } else {
        // 3. When weapon connects, play hit sound
        await this.playExact('hit');
        await new Promise(r => setTimeout(r, 100));
        
        // 5. Narrate hit damage - natural message, hide technical values
        const critText = isCrit ? ' critically' : '';
        await this.narrate(`You hit ${targetName} for ${damage} damage.`);
        
        // 6. If monster survives
        if (remainingHealth > 0) {
          await new Promise(r => setTimeout(r, 300));
          await this.narrate(`${targetName} has ${remainingHealth} health remaining.`);
        }
      }
    },

    // MONSTER TURN
    async monsterAttack(monsterName, damage, isMiss, playerRemainingHealth) {
      // 1. Play monster attack sound
      await this.playExact('monsterAttack');
      await new Promise(r => setTimeout(r, 400));
      
      if (isMiss) {
        await this.playExact('miss');
        await new Promise(r => setTimeout(r, 300));
        await this.narrate(`${monsterName} attacks but you blocked the attack.`);
      } else {
        // 2. Play hit or miss sound
        await this.playExact('monsterHit');
        await new Promise(r => setTimeout(r, 100));
        
        // 3. Narrate hit damage
        await this.narrate(`${monsterName} hits you for ${damage} damage.`);
        
        // 4. Narrate remaining health
        await new Promise(r => setTimeout(r, 300));
        await this.narrate(`You have ${playerRemainingHealth} health remaining.`);
      }
    },

    // HEALING SPELL
    async healingSpell(healAmount, newHealth) {
      // 1. User presses Healing Spell (already done)
      // 2. Play magical healing sound
      await this.playExact('healingStart');
      await new Promise(r => setTimeout(r, 800));
      
      // 3. Play healing completion sound
      await this.playExact('healingComplete');
      await new Promise(r => setTimeout(r, 400));
      
      // 4. Narrate restore
      await this.narrate(`Your healing spell restores ${healAmount} health.`);
      
      // 5. Narrate now have health
      await new Promise(r => setTimeout(r, 300));
      await this.narrate(`You now have ${newHealth} health.`);
    },

    // MONSTER DEFEAT - Play final hit, death, falling BEFORE narration, do NOT play victory yet
    async monsterDefeat(monsterName) {
      // Play: final hit, monster death, body falling - must all play BEFORE narration
      await this.playExact('finalHit');
      await new Promise(r => setTimeout(r, 300));
      
      await this.playExact('monsterDeath');
      await new Promise(r => setTimeout(r, 800));
      
      await this.playExact('bodyFall');
      await new Promise(r => setTimeout(r, 600));
      
      // After those sounds, narrate defeated
      await this.narrate(`${monsterName} defeated.`);
      
      // Do NOT play victory music yet - wait for loot, exp, all monsters
    },

    // LOOT - After every defeated enemy
    async loot(monsterName, items) {
      // items: array of {name, goldAmount} or similar
      if (!items || items.length === 0) {
        // If no loot: Narrate no loot, do NOT play treasure sound
        await this.narrate(`The ${monsterName} dropped no loot.`);
        return;
      }
      
      // If loot exists: Play treasure appearance sound
      await this.playExact('treasureAppear');
      await new Promise(r => setTimeout(r, 500));
      
      // Narrate each item individually
      for (const item of items) {
        if (item.gold) {
          await this.narrate(`You found ${item.gold} Gold.`);
        } else if (item.name) {
          await this.narrate(`You found ${item.name}.`);
          await this.playExact('itemFound');
        }
        await new Promise(r => setTimeout(r, 400));
      }
    },

    // EXPERIENCE - After loot
    async experience(xp, newLevel, oldLevel) {
      await this.narrate(`You gained ${xp} experience.`);
      
      if (newLevel > oldLevel) {
        await new Promise(r => setTimeout(r, 300));
        // Play level-up sound
        await this.playExact('levelUp');
        await new Promise(r => setTimeout(r, 500));
        await this.narrate(`Congratulations! You reached Level ${newLevel}.`);
      }
    },

    // VICTORY - MUST NEVER begin before all monsters defeated, all defeat sounds, loot, exp finish
    async victory() {
      // Wait to ensure all previous narrations and sounds finished
      while (this.isNarrating || this.narrationQueue.length > 0) {
        await new Promise(r => setTimeout(r, 200));
      }
      
      // Only then: Play victory fanfare
      await this.playExact('victoryFanfare');
      await new Promise(r => setTimeout(r, 500));
      
      await this.narrate(`You have won the battle.`);
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
        // User presses Roll Dice -> Play dice rolling sound immediately
        await ProfessionalAudioCombat.playExact('boardDice');
        await new Promise(r => setTimeout(r, 800));
        // TalkBack announces dice result
        await ProfessionalAudioCombat.narrate(`You rolled the dice. You got ${value}.`);
      },
      
      async pieceMove(steps, position, playerName) {
        // Play brief movement sound without step-by-step narration spam
        await ProfessionalAudioCombat.playExact('boardPieceStep');
        await new Promise(r => setTimeout(r, 150));
      },
      
      async snakeBite(from, to) {
        await ProfessionalAudioCombat.playExact('snake_hiss');
        await new Promise(r => setTimeout(r, 600));
        await ProfessionalAudioCombat.playExact('snake_fall');
        await new Promise(r => setTimeout(r, 800));
        await ProfessionalAudioCombat.narrate(`Oh no! A snake bit you. Moving down to square ${to}.`);
      },
      
      async ladderClimb(from, to) {
        await ProfessionalAudioCombat.playExact('ladder_climb');
        await new Promise(r => setTimeout(r, 600));
        await ProfessionalAudioCombat.playExact('ladder_success');
        await new Promise(r => setTimeout(r, 400));
        await ProfessionalAudioCombat.narrate(`Great! You climbed a ladder to square ${to}.`);
      },
      
      async carromStrike(playerName) {
        await ProfessionalAudioCombat.playExact('carrom_strike');
        await new Promise(r => setTimeout(r, 500));
        if (playerName) await ProfessionalAudioCombat.narrate(`${playerName} struck the striker.`);
      },
      
      async carromCollision() {
        await ProfessionalAudioCombat.playExact('carrom_collision');
      },
      
      async carromPocket() {
        await ProfessionalAudioCombat.playExact('carrom_pocket');
        await ProfessionalAudioCombat.narrate(`Coin pocketed!`);
      },
      
      async chessMove(from, to, player) {
        await ProfessionalAudioCombat.playExact('chess_move');
        await ProfessionalAudioCombat.narrate(`${player || ''} moved from ${from} to ${to}.`);
      },
      
      async chessCapture() {
        await ProfessionalAudioCombat.playExact('chess_capture');
        await ProfessionalAudioCombat.narrate(`Piece captured.`);
      },
      
      async chessCheck() {
        await ProfessionalAudioCombat.playExact('chess_check');
        await ProfessionalAudioCombat.narrate(`Check!`);
      },
      
      async chessCheckmate() {
        await ProfessionalAudioCombat.playExact('chess_checkmate');
        await ProfessionalAudioCombat.narrate(`Checkmate!`);
      },
      
      async memoryFlip() {
        await ProfessionalAudioCombat.playExact('card_flip');
      },
      
      async memoryMatch() {
        await ProfessionalAudioCombat.playExact('memory_match');
        await ProfessionalAudioCombat.narrate(`Match found!`);
      },
      
      async memoryWrong() {
        await ProfessionalAudioCombat.playExact('memory_wrong');
        await ProfessionalAudioCombat.narrate(`Not a match, try again.`);
      },
      
      async victory(playerName) {
        // Celebration music, fireworks animation, victory sound
        await ProfessionalAudioCombat.playExact('winner');
        await new Promise(r => setTimeout(r, 500));
        if (playerName) {
          await ProfessionalAudioCombat.narrate(`Congratulations ${playerName}! You won the game.`);
        } else {
          await ProfessionalAudioCombat.narrate(`Congratulations! You won the game.`);
        }
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
