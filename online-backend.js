/* Black Sword Ultimate — online backend.
 *
 * Two free services work together:
 *   - Firebase Authentication signs the player in (Google, or a guest account).
 *     Nothing else from Firebase is used.
 *   - A Supabase project stores everything: profiles, hero names, cloud saves,
 *     friends, chat, chat rooms, feedback, guilds, combat groups, shared loot
 *     and map notes.
 *
 * The browser never talks to the database itself. Every request goes to one
 * small server function (config.dataUrl) together with the player's sign-in
 * token. The function checks the token and the database rules decide what
 * this player may read or write (see server/sql/bsu_004_social_rules.sql).
 *
 * The rest of the game was written against a small query interface
 * (client.from(table).select().eq()…, client.rpc(name), client.channel()).
 * This file provides that interface, so the game code does not need to know
 * which database is behind it.
 */
(() => {
    'use strict';

    const MINUTE = 60000;
    const ok = data => ({ data, error: null });
    const slug = text => String(text || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    const normalName = text => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const nameKey = text => normalName(text).replace(/[\/.]/g, '_');

    const TABLES = ['profiles', 'game_saves', 'friend_requests', 'messages', 'game_feedback', 'guilds', 'guild_members', 'guild_invites',
        'combat_groups', 'combat_group_members', 'combat_group_invites', 'group_battle_actions', 'world_drops', 'chat_rooms',
        'chat_room_invites', 'chat_room_messages', 'community_map_markers'];
    /** Tables from older versions that this backend does not serve. Reads are empty, writes say so. */
    const RETIRED = new Set(['game_hall_sessions', 'game_hall_members', 'game_hall_invites', 'trade_offers', 'blocks', 'reports']);
    const UNAVAILABLE = /^(create_trade_offer|list_trade_offers|respond_trade_offer|accept_trade_offer|create_game_hall_session|join_game_hall_session|update_game_hall_state)$/;
    /** alias → [table, local column] for "alias:table!key(fields)" inside select(). */
    const REL = {
        friend_requests: { sender: ['profiles', 'sender_id'], receiver: ['profiles', 'receiver_id'] },
        messages: { sender: ['profiles', 'sender_id'] },
        guild_members: { guild: ['guilds', 'guild_id'] },
        guild_invites: { guild: ['guilds', 'guild_id'], sender: ['profiles', 'sender_id'] },
        combat_group_members: { group: ['combat_groups', 'group_id'] },
        combat_group_invites: { group: ['combat_groups', 'group_id'], sender: ['profiles', 'sender_id'] },
        chat_rooms: { owner: ['profiles', 'owner_id'] },
        chat_room_invites: { room: ['chat_rooms', 'room_id'], sender: ['profiles', 'sender_id'] },
        chat_room_messages: { sender: ['profiles', 'sender_id'] },
        community_map_markers: { creator: ['profiles', 'creator_id'] }
    };
    /** Tables whose new rows are pushed to the game while it is open. */
    const WATCHABLE = new Set(['messages', 'friend_requests', 'guild_invites', 'combat_group_invites', 'group_battle_actions', 'chat_room_messages']);

    const OFFLINE = 'The online service cannot be reached right now.';
    const NOT_HERE = 'This feature is not available in this version.';
    const DUPLICATE = { guilds: 'That name is already taken.', guild_members: 'You are already a member.', combat_group_members: 'You are already a member.' };
    const INVALID = {
        messages: 'A message needs between 1 and 300 characters.', chat_room_messages: 'A message needs between 1 and 300 characters.',
        guilds: 'A guild name needs between 3 and 32 characters.', game_saves: 'The save is too large for the cloud.'
    };
    /** Turns a database answer into a sentence a player can read. The technical text stays in `details`. */
    function explain(error, table, guest) {
        const code = String(error?.code || ''), details = String(error?.message || '');
        let message;
        if (code === 'P0001' || code === 'unknown-function' || code === 'unauthenticated' || code === 'slow_down' || code === 'too_large') message = details;
        else if (code === '42501') message = 'The online service refused this action.' + (guest ? ' Guests need to sign in with Google for this.' : '');
        else if (code === '23505') message = DUPLICATE[table] || 'That already exists.';
        else if (code === '23514' || code === '23502' || code === '22001') message = INVALID[table] || 'That value is not allowed.';
        else if (code === '23503') message = 'That record no longer exists.';
        else if (code === 'server') message = OFFLINE;
        else message = 'The online request failed. Please try again.';
        return { message: message || 'The online request failed. Please try again.', code, details };
    }
    const refuse = (message, code = 'invalid') => ({ data: null, error: { message, code, details: '' } });

    function createDataClient(auth, config) {
        const transport = typeof config.transport === 'function' ? config.transport : null;
        const fast = Number(config.pollMs) > 0 ? Number(config.pollMs) : 4000;
        const uid = () => auth.currentUser?.uid || null;
        const guest = () => Boolean(auth.currentUser?.isAnonymous);

        /* ---------- one request to the server function ---------- */
        async function send(request, { timeout = 15000 } = {}) {
            const user = auth.currentUser;
            if (!user) return refuse('Please sign in first.', 'unauthenticated');
            try {
                let answer = null;
                if (transport) answer = await transport(request, user);
                else {
                    for (let attempt = 0; attempt < 2; attempt++) {
                        const token = await user.getIdToken(attempt > 0);
                        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
                        let response;
                        try {
                            response = await fetch(config.dataUrl, {
                                method: 'POST', signal: controller.signal,
                                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                                body: JSON.stringify(request)
                            });
                        } finally { clearTimeout(timer); }
                        answer = await response.json().catch(() => null);
                        if (response.status !== 401) break;       // 401: the sign-in token was stale; ask once more with a fresh one
                    }
                }
                if (!answer || typeof answer !== 'object') throw new Error('The server answer could not be read.');
                if (answer.error) return { data: null, error: explain(answer.error, request.table, guest()) };
                return ok(answer.data ?? null);
            } catch (error) {
                return { data: null, error: { message: OFFLINE, code: 'network', details: String(error?.message || error) } };
            }
        }

        /* ---------- the query builder ---------- */
        const relations = (name, columns) => {
            const found = [];
            String(columns || '').replace(/(\w+):(\w+)(?:!\w+)?\(([^)]*)\)/g, (_match, alias) => {
                const link = REL[name]?.[alias];
                if (link) found.push({ alias, table: link[0], col: link[1] });
                return '';
            });
            return found;
        };
        const tidyRow = (name, row) => {
            if (!row || typeof row !== 'object' || name !== 'profiles') return row;
            const { player_code: _secret, ...rest } = row;          // the Player ID is a login secret and is not part of the public profile
            if (typeof rest.display_name === 'string') rest.display_name = rest.display_name.trim().slice(0, 40) || 'Hero';
            if (rest.level !== undefined) rest.level = Math.max(1, Math.min(999, Math.floor(Number(rest.level)) || 1));
            return rest;
        };
        function from(name) {
            const state = { action: 'select', filters: [], order: null, limit: null, columns: '*', one: null, payload: null, returning: false };
            const one = rows => {
                if (!state.one) return ok(rows);
                const list = rows || [];
                if (state.one === 'single' && list.length !== 1) return { data: null, error: { message: list.length ? 'More than one row was found.' : 'No row was found.', code: 'PGRST116', details: '' } };
                if (list.length > 1) return { data: null, error: { message: 'More than one row was found.', code: 'PGRST116', details: '' } };
                return ok(list[0] || null);
            };
            const run = async () => {
                if (RETIRED.has(name)) return state.action === 'select' ? one([]) : refuse(NOT_HERE, 'unavailable-feature');
                if (!TABLES.includes(name)) return refuse(`Table ${name} is not available.`, 'unknown-table');
                const request = { kind: 'query', table: name, action: state.action, filters: state.filters };
                if (state.action === 'select' || state.returning) request.embed = relations(name, state.columns);
                if (state.order) request.order = state.order;
                if (state.limit) request.limit = state.limit;
                if (state.payload !== null) request.values = Array.isArray(state.payload) ? state.payload.map(row => tidyRow(name, row)) : tidyRow(name, state.payload);
                const { data, error } = await send(request, { timeout: name === 'game_saves' ? 40000 : 15000 });
                if (error) return { data: null, error };
                if (state.action === 'insert' && WATCHABLE.has(name)) nudge();
                if (state.action !== 'select' && !state.returning) return state.one ? one(Array.isArray(data) ? data : []) : ok(null);
                return one(Array.isArray(data) ? data : []);
            };
            const add = (op, col, val) => { state.filters.push({ col, op, val: val === undefined ? null : val }); return builder; };
            const builder = {
                select(columns = '*') { state.columns = columns; if (state.action !== 'select') state.returning = true; return builder; },
                insert(payload) { state.action = 'insert'; state.payload = payload ?? {}; return builder; },
                upsert(payload) { state.action = 'upsert'; state.payload = payload ?? {}; return builder; },
                update(payload) { state.action = 'update'; state.payload = payload ?? {}; return builder; },
                delete() { state.action = 'delete'; return builder; },
                eq: (col, val) => add('eq', col, val), neq: (col, val) => add('neq', col, val),
                gt: (col, val) => add('gt', col, val), gte: (col, val) => add('gte', col, val),
                lt: (col, val) => add('lt', col, val), lte: (col, val) => add('lte', col, val),
                ilike: (col, val) => add('ilike', col, val), like: (col, val) => add('like', col, val),
                in: (col, val) => add('in', col, val), is: (col, val) => add('is', col, val),
                order(col, options = {}) { state.order = { col, ascending: options.ascending !== false }; return builder; },
                limit(count) { state.limit = Number(count) || null; return builder; },
                single() { state.one = 'single'; return builder; },
                maybeSingle() { state.one = 'maybe'; return builder; },
                then(resolve, reject) { return run().then(resolve, reject); }
            };
            return builder;
        }

        /* ---------- named actions ---------- */
        const savedCode = () => {
            try { const kept = globalThis.localStorage?.getItem('black_sword_guest_code'); return /^KND-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(kept || '') ? kept : null; } catch { return null; }
        };
        /** The PIN never leaves the device: only this key, made from the PIN and the Player ID, is sent. */
        async function recoveryKey(code, pin) {
            const subtle = globalThis.crypto?.subtle;
            if (!subtle) throw new Error('Player ID and PIN need a secure (https) page.');
            const encode = text => new TextEncoder().encode(text);
            const key = await subtle.importKey('raw', encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
            const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encode('black-sword-recovery:' + String(code).toUpperCase()), iterations: 150000 }, key, 256);
            return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        }
        async function rpc(name, params = {}) {
            if (UNAVAILABLE.test(name)) return refuse(NOT_HERE, 'unavailable-feature');
            if (name === 'has_linked_identity') return ok(Boolean(auth.currentUser && !auth.currentUser.isAnonymous));
            // Player ID + PIN login reads the cloud save itself, so there is no second copy to refresh.
            if (name === 'update_recovery_save') return ok(true);
            let args = { ...(params || {}) };
            try {
                if (name === 'get_my_profile') args.preferred_code = savedCode();
                if (name === 'set_player_recovery_pin') {
                    if (!/^\d{6}$/.test(String(args.new_pin))) return refuse('PIN must be exactly 6 digits.');
                    const profile = await send({ kind: 'rpc', name: 'get_my_profile', args: { preferred_code: savedCode() } });
                    if (profile.error) return profile;
                    args = { recovery_key: await recoveryKey(profile.data.player_code, args.new_pin), current_save: args.current_save || {} };
                }
                if (name === 'recover_progress_with_pin') {
                    const code = String(args.code || '').trim().toUpperCase();
                    if (!code || !/^\d{6}$/.test(String(args.supplied_pin))) return refuse('Invalid Player ID or PIN.');
                    args = { code, recovery_key: await recoveryKey(code, args.supplied_pin) };
                }
            } catch (error) { return refuse(String(error?.message || error)); }
            return send({ kind: 'rpc', name, args }, { timeout: name === 'set_player_recovery_pin' ? 40000 : 15000 });
        }

        /* ---------- live updates ----------
         * The game asks "what is new since my last look?" for the tables it is
         * watching: every few seconds while something is happening, slower when
         * it is quiet, and not at all while the page is hidden. One request
         * covers all watched tables. */
        const watchers = new Set();
        const seen = new Map();
        let cursor = null, cursorFor = null, timer = null, busy = false, lastActivity = Date.now();
        const hidden = () => typeof document !== 'undefined' && document.hidden === true;
        const pause = () => { const quiet = Date.now() - lastActivity; return quiet < 2 * MINUTE ? fast : quiet < 10 * MINUTE ? Math.max(fast, 10000) : Math.max(fast, 30000); };
        function schedule(ms) {
            clearTimeout(timer); timer = null;
            if (!watchers.size) return;
            timer = setTimeout(look, ms === undefined ? pause() : ms);
            timer.unref?.();
        }
        /** Something just happened (a line was sent, the page came back): look again soon. */
        function nudge() { lastActivity = Date.now(); if (watchers.size && !busy) schedule(250); }
        function deliver(event) {
            const row = event?.row;
            if (!row || !WATCHABLE.has(event.table)) return;
            const key = `${event.table}:${row.id}:${event.type}:${event.type === 'UPDATE' ? row.updated_at : ''}`;
            if (seen.has(key)) return;
            seen.set(key, Date.now());
            if (seen.size > 2000) for (const [old, at] of seen) if (Date.now() - at > 10 * MINUTE) seen.delete(old);
            lastActivity = Date.now();
            for (const watcher of [...watchers]) {
                if (watcher.table !== event.table || (watcher.event !== '*' && watcher.event !== event.type)) continue;
                if (watcher.room && row.room_id !== watcher.room) continue;
                try { watcher.callback({ eventType: event.type, new: row, old: {} }); } catch (error) { console.warn('live update handler:', error); }
            }
        }
        let inflight = null;
        /** One look at the server. Calls made while a look is running share that look. */
        function look() {
            clearTimeout(timer); timer = null;
            if (inflight) return inflight;
            if (!watchers.size) return Promise.resolve();
            if (hidden() || !uid()) { schedule(); return Promise.resolve(); }
            busy = true;
            inflight = (async () => {
                try {
                    if (cursorFor !== uid()) { cursor = null; cursorFor = uid(); seen.clear(); }
                    const tables = [...new Set([...watchers].map(watcher => watcher.table))];
                    const room = [...watchers].map(watcher => watcher.room).filter(Boolean).pop() || null;
                    const first = cursor === null;
                    const { data } = await send({ kind: 'rpc', name: 'changes', args: { since: cursor, tables, room_id: room } });
                    if (data?.now) {
                        cursor = data.now;
                        if (!first) for (const event of data.events || []) deliver(event);
                    }
                } catch (error) { console.warn('live updates:', error?.message || error); }
                finally { busy = false; inflight = null; schedule(); }
            })();
            return inflight;
        }
        try { globalThis.document?.addEventListener?.('visibilitychange', () => { if (!hidden()) nudge(); }); } catch { /* no page */ }
        function channel() {
            const wanted = [];
            let mine = [];
            const live = {
                on(_kind, spec, callback) { wanted.push([spec || {}, callback]); return live; },
                subscribe(report) {
                    for (const [spec, callback] of wanted) {
                        if (!WATCHABLE.has(spec.table) || typeof callback !== 'function') continue;
                        const watcher = { table: spec.table, event: spec.event || '*', room: /room_id=eq\.([^,]+)/.exec(String(spec.filter || ''))?.[1] || null, callback };
                        watchers.add(watcher); mine.push(watcher);
                    }
                    lastActivity = Date.now();
                    if (watchers.size && !busy) schedule(cursor === null ? 0 : 250);
                    try { report?.('SUBSCRIBED'); } catch { /* optional */ }
                    return live;
                },
                unsubscribe() {
                    for (const watcher of mine) watchers.delete(watcher);
                    mine = [];
                    if (!watchers.size) { clearTimeout(timer); timer = null; }
                    return Promise.resolve('ok');
                }
            };
            return live;
        }

        /** Is the server function up and can it reach the database? Used by Settings and by the tests. */
        async function health() {
            if (transport) return { ok: true, database: true };
            try { return await (await fetch(config.dataUrl, { method: 'GET' })).json(); } catch { return { ok: false, database: false }; }
        }

        return { from, rpc, channel, removeChannel: live => live?.unsubscribe?.() || Promise.resolve('ok'), tables: [...TABLES], health, lookNow: look };
    }

    /* ───────────────────────── sign-in ───────────────────────── */
    const providerName = id => String(id || '').replace(/\.com$/, '');
    /** The shape the game expects for a signed-in user. */
    function wrapUser(user) {
        if (!user) return null;
        const providers = (user.providerData || []).map(entry => providerName(entry?.providerId)).filter(Boolean);
        const name = user.displayName || user.providerData?.find(entry => entry?.displayName)?.displayName || '';
        return {
            id: user.uid, uid: user.uid, email: user.email || user.providerData?.find(entry => entry?.email)?.email || null,
            displayName: name, is_anonymous: Boolean(user.isAnonymous),
            identities: providers.map(provider => ({ provider })),
            app_metadata: { provider: user.isAnonymous ? 'anonymous' : providers[0] || 'unknown' },
            user_metadata: { display_name: name }
        };
    }
    const session = user => (user ? { user: wrapUser(user) } : null);

    function createAuth(sdk, auth) {
        return {
            getSession() {
                return new Promise(resolve => {
                    const stop = auth.onAuthStateChanged(user => { stop(); resolve({ data: { session: session(user) } }); }, () => resolve({ data: { session: null } }));
                });
            },
            async signInAnonymously() {
                try { const result = await auth.signInAnonymously(); return { data: { session: session(result.user), user: wrapUser(result.user) }, error: null }; }
                catch (error) { return { data: { session: null, user: null }, error }; }
            },
            /**
             * Google sign-in in a popup. A guest is upgraded in place, so the guest's
             * profile, hero names and cloud save stay with the same account. If that
             * Google account already has its own game account, we switch to it instead.
             */
            async signInWithOAuth({ options } = {}) {
                const provider = new sdk.auth.GoogleAuthProvider();
                provider.setCustomParameters?.({ prompt: 'select_account' });
                const current = auth.currentUser;
                try {
                    let result, upgraded = false;
                    if (current?.isAnonymous && typeof current.linkWithPopup === 'function') {
                        try { result = await current.linkWithPopup(provider); upgraded = true; }
                        catch (error) {
                            if (error?.code !== 'auth/credential-already-in-use' || !error.credential) throw error;
                            try { await options?.beforeSwitch?.(); } catch { /* best effort */ }
                            result = await auth.signInWithCredential(error.credential);
                        }
                    } else result = await auth.signInWithPopup(provider);
                    // The database rules read the sign-in method from the token, so make sure it is current.
                    try { await result.user.getIdToken(true); } catch { /* the next request refreshes it */ }
                    const user = auth.currentUser || result.user;
                    return { data: { session: session(user), user: wrapUser(user), upgraded }, error: null };
                } catch (error) {
                    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/user-cancelled') return { data: { session: null, user: null }, error: null };
                    return { data: { session: null, user: null }, error };
                }
            },
            async signOut() { try { await auth.signOut(); return { error: null }; } catch (error) { return { error }; } },
            onAuthStateChange(callback) { return auth.onAuthStateChanged(user => callback('SIGNED_IN', session(user))); },
            async signInWithPassword() { return { data: { session: null, user: null }, error: null }; },
            async signUp() { return { data: { session: null, user: null }, error: null }; }
        };
    }

    function waitForSdk(pick, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const look = () => {
                const sdk = pick();
                if (sdk?.auth) return resolve(sdk);
                if (Date.now() - started > timeout) return reject(new Error('Firebase could not be loaded on this network.'));
                setTimeout(look, 100);
            };
            look();
        });
    }

    async function createClient(config) {
        const sdk = await waitForSdk(() => config.firebaseSdk || globalThis.firebase);
        if (!sdk.apps?.length) sdk.initializeApp(config.firebase);
        const auth = sdk.auth();
        try { await auth.setPersistence?.(sdk.auth.Auth.Persistence.LOCAL); } catch { /* default persistence is fine */ }
        return { auth: createAuth(sdk, auth), ...createDataClient(auth, config), provider: 'firebase' };
    }

    globalThis.BlackSwordBackend = Object.freeze({
        createClient: config => (config?.provider === 'firebase' && config.firebase && (config.dataUrl || config.transport) ? createClient(config) : Promise.resolve(null)),
        wrapUser, slug, normalName, nameKey
    });
})();
