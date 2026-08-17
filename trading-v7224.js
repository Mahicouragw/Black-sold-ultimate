/**
 * v7.22.4 — Player-to-player trading.
 *
 * Items and gold move ONLY through server RPCs that re-verify ownership at
 * settlement time, so nothing can be duplicated by a double click, a replayed
 * request or an edited client. This module is the accessible front end.
 *
 * Commands (work identically for blind and sighted players):
 *   trade <hero name>              open a trade with that hero
 *   trades                         list pending offers
 *   trade offer <item> [xN]        add one of your items to the current draft
 *   trade gold <amount>            add gold to the draft
 *   trade send                     send the draft offer
 *   trade accept <number>          accept an incoming offer
 *   trade decline <number>         decline an incoming offer
 *   trade cancel <number>          cancel an offer you sent
 */
(() => {
    'use strict';

    const Trading = {
        draft: null,          // { heroName, items: [], gold: 0 }
        offers: [],
        busy: false,

        say(text, type = 'system') {
            const game = window.Game;
            game.emitGameEvent?.(text, type) || game.addNarrative(text, type);
        },

        requireOnline() {
            if (!window.OnlineSystem?.ready || !window.OnlineSystem?.user) {
                this.say('Trading needs an online connection. Sign in and try again.');
                return false;
            }
            return true;
        },

        /* ── draft handling ─────────────────────────────────────────────── */

        open(heroName) {
            const name = String(heroName || '').trim();
            if (!name) { this.say('Say: trade, then the hero name. For example: trade Raven.'); return false; }
            if (!this.requireOnline()) return false;
            this.draft = { heroName: name, items: [], gold: 0 };
            this.say(`Trade with ${name} started. Add items with "trade offer [item name]", add gold with "trade gold 50", then say "trade send".`);
            return true;
        },

        addItem(query) {
            if (!this.draft) { this.say('Start a trade first: trade [hero name].'); return false; }
            const raw = String(query || '').trim();
            const match = raw.match(/^(.*?)(?:\s+x\s*(\d+))?$/i);
            const wanted = (match?.[1] || raw).trim().toLowerCase();
            const quantity = Math.max(1, parseInt(match?.[2] || '1', 10));
            if (!wanted) { this.say('Say which item to offer.'); return false; }

            const item = (window.Game.state.inventory || [])
                .find(entry => entry.name.toLowerCase().includes(wanted) || entry.id === wanted);
            if (!item) { this.say(`You do not carry "${raw}".`); return false; }

            // Never let the draft promise more than the hero actually holds.
            const already = this.draft.items.filter(i => i.id === item.id)
                .reduce((sum, i) => sum + i.quantity, 0);
            if (already + quantity > item.quantity) {
                this.say(`You only have ${item.quantity} ${item.name}. You have already offered ${already}.`);
                return false;
            }
            const existing = this.draft.items.find(i => i.id === item.id);
            if (existing) existing.quantity += quantity;
            else this.draft.items.push({ id: item.id, name: item.name, quantity });

            this.say(`Added ${quantity} ${item.name} to the trade. ${this.describeDraft()}`, 'item');
            return true;
        },

        addGold(amount) {
            if (!this.draft) { this.say('Start a trade first: trade [hero name].'); return false; }
            const gold = Math.max(0, parseInt(amount, 10) || 0);
            const purse = window.Game.state.player?.gold || 0;
            if (gold > purse) { this.say(`You only have ${purse} gold.`); return false; }
            this.draft.gold = gold;
            this.say(`Offering ${gold} gold. ${this.describeDraft()}`, 'item');
            return true;
        },

        describeDraft() {
            if (!this.draft) return 'No trade in progress.';
            const items = this.draft.items.length
                ? this.draft.items.map(i => `${i.quantity} ${i.name}`).join(', ')
                : 'no items';
            return `Trade with ${this.draft.heroName}: offering ${items} and ${this.draft.gold} gold. Say "trade send" to send it.`;
        },

        /* ── server calls ───────────────────────────────────────────────── */

        async send() {
            if (!this.draft) { this.say('Start a trade first: trade [hero name].'); return false; }
            if (!this.draft.items.length && !this.draft.gold) {
                this.say('Add at least one item or some gold before sending.');
                return false;
            }
            if (!this.requireOnline()) return false;
            if (this.busy) { this.say('A trade action is already in progress.'); return false; }

            this.busy = true;
            try {
                const { data, error } = await window.OnlineSystem.client.rpc('create_trade_offer', {
                    target_hero: this.draft.heroName,
                    offered: this.draft.items,
                    requested: [],
                    gold_offered: this.draft.gold,
                    gold_requested: 0
                });
                if (error) { this.say(this.friendlyError(error.message)); return false; }
                this.say(`Trade offer sent to ${this.draft.heroName}. They have ten minutes to accept.`, 'treasure');
                window.MusicSystem?.playSFX?.('coin');
                this.draft = null;
                return Boolean(data);
            } finally { this.busy = false; }
        },

        async list() {
            if (!this.requireOnline()) return [];
            const { data, error } = await window.OnlineSystem.client.rpc('list_trade_offers');
            if (error) { this.say(this.friendlyError(error.message)); return []; }
            this.offers = data || [];
            if (!this.offers.length) { this.say('You have no pending trades.'); return []; }

            // Numbered so a screen-reader user can act without pointing.
            this.offers.forEach((offer, index) => {
                const items = (offer.offer_items || []).map(i => `${i.quantity} ${i.name}`).join(', ') || 'no items';
                const wants = (offer.request_items || []).map(i => `${i.quantity} ${i.name}`).join(', ');
                const direction = offer.direction === 'incoming'
                    ? `${offer.other_hero} offers you`
                    : `You offered ${offer.other_hero}`;
                const wantText = wants || offer.request_gold ? ` and asks for ${wants || ''}${offer.request_gold ? ` ${offer.request_gold} gold` : ''}` : '';
                this.say(`Trade ${index + 1}: ${direction} ${items}${offer.offer_gold ? ` and ${offer.offer_gold} gold` : ''}${wantText}.`, 'item');
            });
            this.say('Say "trade accept 1", "trade decline 1", or "trade cancel 1".');
            return this.offers;
        },

        offerAt(index) {
            const position = parseInt(index, 10);
            if (!position || position < 1 || position > this.offers.length) {
                this.say('That trade number is not in your list. Say "trades" to hear them again.');
                return null;
            }
            return this.offers[position - 1];
        },

        async accept(index) {
            const offer = this.offerAt(index);
            if (!offer) return false;
            if (offer.direction !== 'incoming') { this.say('You can only accept a trade someone sent to you.'); return false; }
            if (this.busy) { this.say('A trade action is already in progress.'); return false; }

            this.busy = true;
            try {
                const { error } = await window.OnlineSystem.client.rpc('accept_trade_offer', { offer_id: offer.id });
                if (error) { this.say(this.friendlyError(error.message)); return false; }
                this.say(`Trade complete. You and ${offer.other_hero} have exchanged your goods.`, 'treasure');
                window.MusicSystem?.playSFX?.('levelup');
                // The server is authoritative, so pull the updated hero back down.
                await window.OnlineSystem.loadGame?.();
                window.Game.updateHUD?.();
                await this.list();
                return true;
            } finally { this.busy = false; }
        },

        async respond(index, decision) {
            const offer = this.offerAt(index);
            if (!offer) return false;
            const { error } = await window.OnlineSystem.client.rpc('respond_trade_offer', {
                offer_id: offer.id, decision
            });
            if (error) { this.say(this.friendlyError(error.message)); return false; }
            this.say(decision === 'decline'
                ? `You declined the trade from ${offer.other_hero}.`
                : `You cancelled your trade with ${offer.other_hero}.`);
            await this.list();
            return true;
        },

        /** Never surface raw database errors to a player. */
        friendlyError(message) {
            const text = String(message || '');
            if (/no hero found/i.test(text)) return 'No hero with that exact name was found.';
            if (/yourself/i.test(text)) return 'You cannot trade with yourself.';
            if (/enough gold/i.test(text)) return 'There is not enough gold to complete that trade.';
            if (/do not have enough|no longer has|no longer have/i.test(text)) return 'That trade failed because the items are no longer available.';
            if (/expired/i.test(text)) return 'That trade offer has expired.';
            if (/too many/i.test(text)) return 'Too many trade offers. Please wait a few minutes.';
            if (/not pending/i.test(text)) return 'That trade has already been answered.';
            console.warn('Trade error:', text);
            return 'The trade could not be completed. Please try again shortly.';
        }
    };

    window.Trading = Trading;

    const bind = () => {
        if (!window.Game || window.Game._tradingBound) return false;
        window.Game._tradingBound = true;

        const previous = window.Game.processCommand.bind(window.Game);
        window.Game.processCommand = function (cmd) {
            const raw = String(cmd || '').trim();
            const lower = raw.toLowerCase();

            if (lower === 'trades' || lower === 'trade list' || lower === 'my trades') { Trading.list(); return; }
            if (lower === 'trade send') { Trading.send(); return; }
            if (lower === 'trade status') { Trading.say(Trading.describeDraft()); return; }
            if (lower === 'trade cancel draft') { Trading.draft = null; Trading.say('Trade draft cleared.'); return; }

            let match = lower.match(/^trade\s+gold\s+(\d+)$/);
            if (match) { Trading.addGold(match[1]); return; }

            match = raw.match(/^trade\s+offer\s+(.+)$/i);
            if (match) { Trading.addItem(match[1]); return; }

            match = lower.match(/^trade\s+accept\s+(\d+)$/);
            if (match) { Trading.accept(match[1]); return; }

            match = lower.match(/^trade\s+decline\s+(\d+)$/);
            if (match) { Trading.respond(match[1], 'decline'); return; }

            match = lower.match(/^trade\s+cancel\s+(\d+)$/);
            if (match) { Trading.respond(match[1], 'cancel'); return; }

            if (lower === 'trade' || lower === 'trade help') {
                this.addNarrative('Trading: "trade [hero name]" to start, "trade offer [item]" to add an item, "trade gold 50" to add gold, "trade send" to send. Say "trades" to hear pending offers.', 'system');
                return;
            }

            match = raw.match(/^trade\s+(?:with\s+)?(.+)$/i);
            if (match) { Trading.open(match[1]); return; }

            return previous(cmd);
        };
        console.log('v7.22.4 player trading active');
        return true;
    };

    if (!bind()) {
        document.addEventListener('DOMContentLoaded', bind);
        let tries = 0;
        const timer = setInterval(() => { if (bind() || ++tries > 50) clearInterval(timer); }, 100);
    }
})();
