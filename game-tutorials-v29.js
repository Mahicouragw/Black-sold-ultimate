/**
 * v29 — Full-game tutorials, delete confirmation, party healing, door spell UI.
 */
(() => {
    'use strict';

    const CHAPTERS = {
        create: {
            title: 'How to create a hero',
            text: 'On the title screen choose New Adventure. Type a unique hero name of at least two letters, or tap Generate Unique Hero Name. Choose a race and a class. Preview HP, magic and attributes. Pick Standard, Hardcore or Archo mode, then a background. Tap Begin Adventure. You can make more heroes later from My Heroes.'
        },
        where: {
            title: 'Where to go',
            text: 'You start in Kaliwasch Market Square. Use North, South, East, West and the diagonal buttons, or type those words. Type look to hear the place. Type map or wayfinder for routes. Go up from the city to reach the expanded realms. Northwest from Kaliwasch District 16 is the Car Racing District. The Game Hall and stables host other games. Type travel and a place name to use a waystone for 10 gold.'
        },
        do: {
            title: 'What to do',
            text: 'Talk to people with talk or ask a question. Take items, use potions, equip weapons. Open shop in markets. Accept quests and type quests to review them. Invite companions with invite and a name. Chat rooms and friends are on the action bar. Type help any time for the full command list.'
        },
        fight: {
            title: 'How to fight',
            text: 'Combat starts when a monster finds you, a quest requires it, or you type hunt. Then use Attack, Healing Spell, Multiple Strike, Shock, Items, Defend or Flee. Typed commands do the same thing as the buttons. You cannot walk away until the fight ends unless you flee. Companions act after you.'
        },
        heal: {
            title: 'How healing works',
            text: 'Healing Spell is always on the action bar, in battle and out of battle. You can heal yourself, one companion, or the whole battle party. The battle party is you, your companions, and every ally in your combat group, including their companions when the game knows them. Healing costs mana. If health is already full, the spell tells you and does nothing.'
        },
        doors: {
            title: 'Opening doors with magic',
            text: 'The Opening Door Spell button is always visible. When a magical locked door is in this place, tap it or type opening doors or alohomora. The door opens with magic and the path appears. If there is no such door, you shout the spell and nothing happens. No mana is spent when nothing is there to open.'
        },
        racing: {
            title: 'Car racing and horse racing',
            text: 'Car racing: from the title screen open Game Tutorial, chapter racing — or in the world type racing or tutorial racing. Walk northwest from Kaliwasch District 16, or tap Racing. Then New Race. Say accelerate, brake, left, right, boost, map, status, quit race. Sighted players also see the track. Horse racing is different: type race, then race 2 50. Type race rules for the stables tutorial.'
        },
        delete: {
            title: 'How to delete a hero or account',
            text: 'Open My Heroes, choose Delete Hero, then confirm Yes, delete. That hero is gone and cannot be undone. To delete the whole account, open Settings, tap Delete account, and confirm. That clears local heroes, racing data and signs you out. Cloud copies are removed when you are signed in. Never share your Player ID or PIN.'
        }
    };

    function say(text, type) {
        const G = window.Game;
        if (G?.emitGameEvent) return G.emitGameEvent(text, type || 'system');
        if (G?.addNarrative) G.addNarrative(text, type || 'system');
    }

    function showChapter(id) {
        const ch = CHAPTERS[id];
        if (!ch) return;
        const body = document.getElementById('tutorial-body');
        if (!body) return;
        body.innerHTML = `<h3>${ch.title}</h3><p>${ch.text}</p>`;
        body.focus();
        say(`${ch.title}. ${ch.text}`, 'system');
    }

    function openTutorialScreen() {
        window.Game?.showScreen?.('tutorial-screen');
        const body = document.getElementById('tutorial-body');
        if (body && !body.querySelector('h3')) {
            body.innerHTML = '<p>Choose a chapter. You can replay any chapter any time from the title screen or by typing tutorial.</p>';
        }
        say('Game tutorial. Choose a chapter: create a hero, where to go, what to do, how to fight, healing, doors, racing, or how to delete.', 'system');
    }

    function confirmAction({ title, body, yesLabel }) {
        return new Promise(resolve => {
            const dialog = document.getElementById('confirm-dialog');
            const titleEl = document.getElementById('confirm-dialog-title');
            const bodyEl = document.getElementById('confirm-dialog-body');
            const yes = document.getElementById('confirm-dialog-yes');
            const no = document.getElementById('confirm-dialog-no');
            if (!dialog || !yes || !no) {
                resolve(window.confirm(body));
                return;
            }
            titleEl.textContent = title || 'Please confirm';
            bodyEl.textContent = body || '';
            yes.textContent = yesLabel || 'Yes, delete';
            dialog.classList.remove('hidden');
            setTimeout(() => no.focus(), 0);
            const onKey = (ev) => {
                if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
            };
            const finish = (ok) => {
                dialog.classList.add('hidden');
                yes.removeEventListener('click', onYes);
                no.removeEventListener('click', onNo);
                dialog.removeEventListener('keydown', onKey);
                resolve(ok);
            };
            const onYes = () => finish(true);
            const onNo = () => finish(false);
            yes.addEventListener('click', onYes);
            no.addEventListener('click', onNo);
            dialog.addEventListener('keydown', onKey);
        });
    }

    function collectPartyMembers(game) {
        const out = [];
        const p = game.state.player;
        if (p) out.push({ kind: 'self', name: p.name || 'You', hp: p.hp, maxHp: p.maxHp, ref: p });
        (game.state.companions || []).forEach(c => {
            out.push({ kind: 'companion', name: c.name, hp: c.hp, maxHp: c.maxHp, ref: c });
        });
        (game.state.combatGroup || []).forEach(name => {
            const n = String(name);
            if (out.some(m => m.name === n)) return;
            out.push({ kind: 'ally', name: n, hp: null, maxHp: null, ref: null });
        });
        return out;
    }

    function applyHealToMember(member, amount) {
        if (!member.ref || !Number.isFinite(member.ref.hp)) return 0;
        const before = member.ref.hp;
        const max = member.ref.maxHp || member.ref.hp;
        member.ref.hp = Math.min(max, member.ref.hp + amount);
        return member.ref.hp - before;
    }

    function castPartyHeal(game, mode, targetName) {
        const p = game.state.player;
        if (!p) { say('No active hero.', 'system'); return false; }
        const spell = (p.spells || []).find(s => /heal|mend|sanctuary|choir|moonwell|second wind/i.test(s));
        if (!spell) { say('You do not know a healing spell.', 'system'); return false; }
        const cost = mode === 'party' ? 22 : 14;
        if (p.mp < cost) { say('You do not have enough mana.', 'system'); return false; }
        const members = collectPartyMembers(game);
        let targets = members;
        if (mode === 'self') targets = members.filter(m => m.kind === 'self');
        else if (mode === 'one') {
            const q = String(targetName || '').toLowerCase();
            targets = members.filter(m => m.name.toLowerCase().includes(q));
            if (!targets.length) { say('That ally is not in your battle party.', 'system'); return false; }
        }
        const amount = Math.max(12, 18 + Math.floor((p.wis || 10) / 3) + (p.level || 1) * 2);
        p.mp -= cost;
        const healed = [];
        const namedOnly = [];
        for (const m of targets) {
            const got = applyHealToMember(m, amount);
            if (got > 0) healed.push(`${m.name} ${got} health`);
            else if (m.kind === 'ally') namedOnly.push(m.name);
        }
        window.MusicSystem?.playSFX?.('heal');
        if (!healed.length && !namedOnly.length) {
            say('Nobody in the chosen group needed healing. The spell fades.', 'system');
        } else {
            let line = `${spell} shines over the battle party.`;
            if (healed.length) line += ` Restored: ${healed.join('; ')}.`;
            if (namedOnly.length) line += ` ${namedOnly.join(', ')} and their companions share the light.`;
            say(line, 'magic');
        }
        game.updateHUD?.();
        game.save?.();
        if (game.state.inCombat) game.enemyAttack?.();
        return true;
    }

    function openHealPicker(game) {
        const panel = document.getElementById('heal-target-panel');
        const list = document.getElementById('heal-target-list');
        if (!panel || !list || !game?.state?.player) return;
        const members = collectPartyMembers(game);
        list.replaceChildren();
        const addBtn = (label, fn) => {
            const b = document.createElement('button');
            b.className = 'menu-btn';
            b.type = 'button';
            b.textContent = label;
            b.addEventListener('click', () => { fn(); panel.classList.add('hidden'); });
            list.appendChild(b);
        };
        addBtn(`Heal myself (${game.state.player.hp}/${game.state.player.maxHp} health)`, () => castPartyHeal(game, 'self'));
        members.filter(m => m.kind === 'companion').forEach(m => {
            addBtn(`Heal ${m.name} (${m.hp}/${m.maxHp} health)`, () => castPartyHeal(game, 'one', m.name));
        });
        addBtn('Heal battle party — me, companions, and combat-group allies', () => castPartyHeal(game, 'party'));
        panel.classList.remove('hidden');
        say('Healing spell. Choose yourself, one companion, or the whole battle party.', 'system');
    }

    function locationHasMagicDoor(game) {
        const loc = window.WorldData?.locations?.[game.state.location];
        return Boolean(loc?.specialDoor?.magical && !loc.specialDoor.open);
    }

    function updateDoorButton(game) {
        const btn = document.getElementById('btn-opening-doors');
        if (!btn || !game?.state) return;
        const present = locationHasMagicDoor(game);
        btn.setAttribute('aria-label', present
            ? 'Opening door spell. A magical door is here.'
            : 'Opening door spell. No magical door here.');
        btn.classList.toggle('available', present);
    }

    function shoutOpeningDoor(game) {
        const loc = window.WorldData?.locations?.[game.state.location];
        const door = loc?.specialDoor;
        if (door?.magical && !door.open && window.GameSpellSystem) {
            return window.GameSpellSystem.castOpeningDoors(game);
        }
        say('You shout Alohomora! The word echoes. Nothing happens. There is no magical door here.', 'magic');
        window.MusicSystem?.playSFX?.('board-error');
        return false;
    }

    function deleteAccountLocal(game) {
        try {
            const roster = game.getRoster?.() || { heroes: {} };
            Object.keys(roster.heroes || {}).forEach(id => window.OnlineSystem?.releaseHeroName?.(id));
            localStorage.removeItem(game.state.rosterKey);
            localStorage.removeItem(game.state.saveKey);
            localStorage.removeItem('black_sword_ultimate_save');
        } catch {}
        game.state.player = null;
        game.state.activeHeroId = null;
        game.state.racing = null;
        const cont = document.getElementById('btn-continue');
        if (cont) cont.disabled = true;
        window.OnlineSystem?.signOut?.({ flush: false });
        say('Your local account data and heroes have been deleted. You are signed out.', 'system');
        game.showScreen?.('title-screen');
    }

    function bind() {
        const G = window.Game;
        if (!G || G._v29Tutorials) return false;
        G._v29Tutorials = true;

        document.getElementById('btn-tutorial')?.addEventListener('click', openTutorialScreen);
        document.getElementById('btn-tutorial-start')?.addEventListener('click', () => G.startNewHero());
        document.querySelectorAll('[data-tutorial]').forEach(btn => {
            btn.addEventListener('click', () => showChapter(btn.getAttribute('data-tutorial')));
        });

        document.getElementById('btn-world-heal')?.addEventListener('click', () => openHealPicker(G));
        document.getElementById('btn-opening-doors')?.addEventListener('click', () => shoutOpeningDoor(G));

        document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
            const ok = await confirmAction({
                title: 'Delete account',
                body: 'This permanently deletes local heroes, racing progress and signs you out. This cannot be undone. Delete this account?',
                yesLabel: 'Yes, delete account'
            });
            if (ok) deleteAccountLocal(G);
            else say('Account deletion cancelled.', 'system');
        });

        G.deleteHero = async function (id) {
            const roster = this.getRoster();
            const hero = roster.heroes[id];
            if (!hero) return false;
            const name = hero.player?.name || 'this hero';
            const ok = await confirmAction({
                title: 'Delete hero',
                body: `Permanently delete ${name}? Hero ID ${id}. This cannot be undone.`,
                yesLabel: 'Yes, delete hero'
            });
            if (!ok) { say('Hero deletion cancelled.', 'system'); return false; }
            const deleted = await this.commitHeroDeletion(id);
            if (deleted) say(`${name} has been deleted. Choose another hero when you are ready.`, 'system');
            return deleted;
        };

        const prevSpells = G.getClassSpells.bind(G);
        G.getClassSpells = function (cls, extra) {
            const list = prevSpells(cls, extra) || [];
            if (!list.some(s => /alohomora|opening/i.test(s))) list.push('Alohomora');
            return list;
        };

        const ensureDoorSpell = () => {
            const p = G.state.player;
            if (p && Array.isArray(p.spells) && !p.spells.some(s => /alohomora|opening/i.test(s))) p.spells.push('Alohomora');
        };
        const prevContinue = G.continueGame.bind(G);
        G.continueGame = function () { prevContinue(); ensureDoorSpell(); };
        ensureDoorSpell();

        const prevEnter = G.enterLocation.bind(G);
        G.enterLocation = function (locId) {
            prevEnter(locId);
            updateDoorButton(this);
        };

        const prevCmd = G.processCommand.bind(G);
        G.processCommand = function (raw) {
            const c = String(raw || '').trim().toLowerCase();
            if (c === 'tutorial' || c === 'game tutorial' || c === 'how to play tutorial') {
                if (this.state.screen === 'game-screen') {
                    say('Tutorial chapters: type tutorial create, tutorial where, tutorial fight, tutorial heal, tutorial doors, tutorial racing, or tutorial delete.', 'system');
                    return;
                }
                openTutorialScreen();
                return;
            }
            const chap = c.match(/^tutorial\s+(create|where|do|fight|heal|doors|racing|delete)$/);
            if (chap) { showChapter(chap[1]); return; }
            if (c === 'heal party' || c === 'cast heal party' || c === 'mass heal party') {
                castPartyHeal(this, 'party');
                return;
            }
            if (c === 'opening doors' || c === 'opening door' || c === 'alohomora' || c === 'cast alohomora') {
                shoutOpeningDoor(this);
                return;
            }
            if (c === 'healing spell' || c === 'heal menu') {
                openHealPicker(this);
                return;
            }
            return prevCmd(raw);
        };

        window.GameTutorials = { showChapter, openTutorialScreen, confirmAction, collectPartyMembers, castPartyHeal, shoutOpeningDoor, CHAPTERS };
        console.log('v29 tutorials, party heal, door shout, delete confirmation ready');
        return true;
    }

    if (!bind()) {
        document.addEventListener('DOMContentLoaded', bind);
        let n = 0;
        const t = setInterval(() => { if (bind() || ++n > 40) clearInterval(t); }, 80);
    }
})();
