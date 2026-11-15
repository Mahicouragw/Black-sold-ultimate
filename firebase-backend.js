/* Black Sword Ultimate — Firebase backend.
 *
 * One free Firebase project does everything online:
 *   - Firebase Authentication: guests (anonymous) and Google sign-in.
 *   - Cloud Firestore: profiles, hero names, cloud saves, friends, chat, chat
 *     rooms, feedback, guilds, combat groups, shared loot and map markers.
 *
 * The rest of the game was written against a small query interface
 * (client.from(table).select().eq()…, client.rpc(name), client.channel()).
 * This file provides that interface on top of Firestore, so the game code
 * does not need to know which database is behind it.
 *
 * Layout rules that keep the project inside the free plan and need no manual
 * index setup:
 *   - every query uses only equality filters, or one range on one field;
 *   - short-lived data (chat, loot, battle actions) carries a server
 *     timestamp and is only ever read inside its lifetime;
 *   - big values (the save) are stored as text in parts, because a Firestore
 *     document is limited to one megabyte and cannot hold nested lists.
 *
 * Access is enforced by firestore.rules, not by this file.
 */
(() => {
    'use strict';

    const MINUTE = 60000;
    const PART_SIZE = 240000;
    const DEFAULT_ROOMS = {
        world: { name: 'World Chat', language: 'en-US', member_limit: 200 },
        trade: { name: 'Trade Chat', language: 'en-US', member_limit: 100 },
        help: { name: 'Help & New Heroes', language: 'en-US', member_limit: 100 },
        french: { name: 'Discussion Française', language: 'fr-FR', member_limit: 100 }
    };
    const ROOM_ACTIVE_MS = 150000;

    const ok = data => ({ data, error: null });
    const FRIENDLY = {
        'permission-denied': 'The online service refused this action.',
        'unavailable': 'The online service cannot be reached right now.',
        'unauthenticated': 'Please sign in again.',
        'resource-exhausted': 'The free online quota for today is used up. Online features return tomorrow.',
        'failed-precondition': 'The online database is not fully set up yet.',
        'not-found': 'That record no longer exists.'
    };
    const toError = error => {
        const code = String(error?.code || '').replace(/^firestore\//, '');
        return { message: error?.friendly || FRIENDLY[code] || error?.message || 'Online request failed.', code, details: error?.message || '' };
    };
    const problem = (message, code = 'invalid') => Object.assign(new Error(message), { friendly: message, code });
    const slug = text => String(text || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    const normalName = text => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    /** A hero name as a document name (a document name may not hold a slash or be only dots). */
    const nameKey = text => normalName(text).replace(/[\/.]/g, '_');
    const isStamp = value => Boolean(value) && typeof value === 'object' && typeof value.toDate === 'function';
    const iso = value => isStamp(value) ? value.toDate().toISOString() : value;

    /* ───────────────────────── tables ─────────────────────────
     * key      column that is the document id (default "id")
     * docId    builds the document id for a new row
     * scope    columns of which one must equal the caller (what the rules allow to be listed)
     * parent   [collection, column, subcollection]: rows live under a parent document
     * stamp    created_at is written by the server
     * ttl      lifetime in ms; expires_at is derived, expired rows are never read
     * text     columns stored as JSON text
     * unique   inserting an existing pending row is an error, as in SQL
     * follow   [membership table, member column]: live updates follow the groups the caller belongs to
     * rel      alias → [table, local column] for embedded lookups in select()
     */
    const TABLES = {
        profiles: { docId: row => row.id },
        game_saves: { key: 'user_id', docId: row => row.user_id, chunked: 'save_data' },
        friend_requests: { docId: row => `${row.sender_id}_${row.receiver_id}`, scope: ['sender_id', 'receiver_id'], stamp: true, unique: true, defaults: { status: 'pending' }, rel: { sender: ['profiles', 'sender_id'], receiver: ['profiles', 'receiver_id'] } },
        messages: { special: 'messages', ttl: 5 * MINUTE, rel: { sender: ['profiles', 'sender_id'] } },
        game_feedback: { stamp: true, scope: ['user_id'], defaults: { status: 'new' } },
        guilds: { docId: row => slug(row.name), stamp: true, unique: true, defaults: { rupees: 0 } },
        guild_members: { docId: row => `${row.guild_id}_${row.user_id}`, stamp: true, rel: { guild: ['guilds', 'guild_id'] } },
        guild_invites: { docId: row => `${row.guild_id}_${row.receiver_id}`, scope: ['receiver_id', 'sender_id'], stamp: true, unique: true, defaults: { status: 'pending' }, rel: { guild: ['guilds', 'guild_id'], sender: ['profiles', 'sender_id'] } },
        combat_groups: { stamp: true, defaults: { status: 'open' } },
        combat_group_members: { docId: row => `${row.group_id}_${row.user_id}`, stamp: true, rel: { group: ['combat_groups', 'group_id'] } },
        combat_group_invites: { docId: row => `${row.group_id}_${row.receiver_id}`, scope: ['receiver_id', 'sender_id'], stamp: true, unique: true, defaults: { status: 'pending' }, rel: { group: ['combat_groups', 'group_id'], sender: ['profiles', 'sender_id'] } },
        group_battle_actions: { parent: ['combat_groups', 'group_id', 'actions'], follow: ['combat_group_members', 'user_id'], stamp: true, ttl: 2 * MINUTE },
        world_drops: { stamp: true, ttl: 60 * MINUTE, text: ['item_snapshot'], defaults: { quantity: 1 } },
        chat_rooms: { special: 'rooms', stamp: true, rel: { owner: ['profiles', 'owner_id'] } },
        chat_room_invites: { docId: row => `${row.room_id}_${row.receiver_id}`, scope: ['receiver_id', 'sender_id'], stamp: true, unique: true, defaults: { status: 'pending' }, rel: { room: ['chat_rooms', 'room_id'], sender: ['profiles', 'sender_id'] } },
        chat_room_messages: { parent: ['chat_rooms', 'room_id', 'messages'], stamp: true, ttl: 5 * MINUTE, rel: { sender: ['profiles', 'sender_id'] } },
        community_map_markers: { stamp: true, rel: { creator: ['profiles', 'creator_id'] } }
    };
    /** Tables from older versions that this backend does not serve. Reads are empty, writes say so. */
    const RETIRED = new Set(['game_hall_sessions', 'game_hall_members', 'game_hall_invites', 'trade_offers', 'blocks', 'reports']);

    function createDataClient(sdk, auth) {
        const db = sdk.firestore();
        const { FieldValue, Timestamp } = sdk.firestore;
        const uid = () => auth.currentUser?.uid || null;
        const need = () => { const id = uid(); if (!id) throw problem('Please sign in first.', 'unauthenticated'); return id; };
        const stampAt = ms => Timestamp.fromMillis(ms);
        const profileCache = new Map();
        const fail = error => {
            const result = { data: null, error: toError(error) };
            if (result.error.code === 'permission-denied' && auth.currentUser?.isAnonymous) result.error.message += ' Guests need to sign in with Google for this.';
            return result;
        };

        const toRow = (cfg, snap) => {
            const raw = snap.data({ serverTimestamps: 'estimate' }) || {};
            const row = {};
            for (const [field, value] of Object.entries(raw)) row[field] = iso(value);
            if (row.id === undefined) row.id = snap.id;
            for (const field of cfg.text || []) if (typeof row[field] === 'string') { try { row[field] = JSON.parse(row[field]); } catch { /* keep text */ } }
            if (cfg.ttl && !row.expires_at && Number.isFinite(Date.parse(row.created_at))) row.expires_at = new Date(Date.parse(row.created_at) + cfg.ttl).toISOString();
            Object.defineProperty(row, '__ref', { value: snap.ref, enumerable: false });
            return row;
        };
        const toDoc = (name, cfg, row, { insert = false } = {}) => {
            const doc = {};
            for (const [field, value] of Object.entries(row)) {
                if (value === undefined || field === 'expires_at') continue;
                doc[field] = (cfg.text || []).includes(field) && typeof value !== 'string' ? JSON.stringify(value) : value;
            }
            if (insert) {
                for (const [field, value] of Object.entries(cfg.defaults || {})) if (doc[field] === undefined) doc[field] = value;
                if (cfg.stamp) doc.created_at = FieldValue.serverTimestamp();
            }
            if (name === 'profiles') {
                delete doc.player_code;                              // the Player ID is a login secret: it lives in accounts/{uid}
                if (typeof doc.display_name === 'string') { doc.display_name = doc.display_name.trim().slice(0, 40) || 'Hero'; doc.name_lower = normalName(doc.display_name); }
                if (doc.level !== undefined) doc.level = Math.max(1, Math.min(999, Math.floor(Number(doc.level)) || 1));
            }
            return doc;
        };

        /* ---------- big values in parts ---------- */
        async function writeParts(ref, meta, value) {
            const text = JSON.stringify(value ?? {});
            const parts = [];
            for (let at = 0; at < text.length; at += PART_SIZE) parts.push(text.slice(at, at + PART_SIZE));
            if (parts.length > 30) throw problem('The save is too large for the cloud.');
            const batch = db.batch();
            batch.set(ref, { ...meta, parts: parts.length, size: text.length }, { merge: true });
            parts.forEach((part, index) => batch.set(ref.collection('parts').doc(String(index)), { data: part }));
            await batch.commit();
        }
        async function readParts(snap) {
            const count = Number(snap.data()?.parts) || 0;
            if (!count) return {};
            const docs = await Promise.all(Array.from({ length: count }, (_, index) => snap.ref.collection('parts').doc(String(index)).get()));
            const text = docs.map(doc => doc.exists ? doc.data().data || '' : '').join('');
            try { return JSON.parse(text); } catch { throw problem('The cloud save could not be read.'); }
        }

        /* ---------- filters evaluated on the device ---------- */
        const compare = (a, b) => (a === b ? 0 : a > b ? 1 : -1);
        const like = (pattern, value) => new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i').test(String(value ?? ''));
        const matches = (row, filters) => filters.every(({ col, op, val }) => {
            const value = row[col] === undefined ? null : row[col];
            switch (op) {
                case 'eq': return value === val;
                case 'neq': return value !== val;
                case 'gt': return value !== null && compare(value, val) > 0;
                case 'gte': return value !== null && compare(value, val) >= 0;
                case 'lt': return value !== null && compare(value, val) < 0;
                case 'lte': return value !== null && compare(value, val) <= 0;
                case 'ilike': case 'like': return like(val, value);
                case 'in': return Array.isArray(val) && val.includes(value);
                case 'is': return value === val;
                default: return true;
            }
        });
        const finish = (rows, state) => {
            let list = rows.filter(row => matches(row, state.filters));
            if (state.order) {
                const { col, ascending } = state.order;
                list.sort((a, b) => compare(a[col] ?? '', b[col] ?? '') * (ascending ? 1 : -1));
            }
            if (state.limit) list = list.slice(0, state.limit);
            return list;
        };

        /* ---------- where rows live ---------- */
        function collectionOf(name, cfg, values) {
            if (!cfg.parent) return db.collection(name);
            const [parent, column, child] = cfg.parent;
            const owner = values[column];
            if (!owner) throw problem(`${name} needs ${column}.`);
            return db.collection(parent).doc(String(owner)).collection(child);
        }
        const liveBound = cfg => stampAt(Date.now() - cfg.ttl);

        /* ---------- special tables ---------- */
        const SPECIAL = {
            messages: {
                queries() {
                    const bound = liveBound(TABLES.messages), me = need();
                    return [db.collection('public_messages'), db.collection('inbox').doc(me).collection('messages')]
                        .map(collection => collection.where('created_at', '>', bound).orderBy('created_at', 'desc').limit(50));
                },
                async select() {
                    if (Date.now() - (this._tidiedAt || 0) > 10 * MINUTE) { this._tidiedAt = Date.now(); rpc('tidy_expired_chat').catch(() => {}); }
                    const snaps = await Promise.all(this.queries().map(query => query.get()));
                    return snaps.flatMap(snap => snap.docs.map(doc => toRow(TABLES.messages, doc)));
                },
                async insert(row) {
                    const me = need(), body = String(row.body || '').trim();
                    if (!body || body.length > 300) throw problem('A message needs between 1 and 300 characters.');
                    if (row.sender_id !== me) throw problem('You can only send messages as yourself.');
                    const data = { sender_id: me, receiver_id: row.receiver_id || null, body, voice_id: String(row.voice_id || 'system:default').slice(0, 80), source_language: String(row.source_language || 'en').slice(0, 12), created_at: FieldValue.serverTimestamp() };
                    const id = db.collection('public_messages').doc().id;
                    if (!data.receiver_id) await db.collection('public_messages').doc(id).set(data);
                    else {
                        const batch = db.batch();
                        batch.set(db.collection('inbox').doc(data.receiver_id).collection('messages').doc(id), data);
                        batch.set(db.collection('inbox').doc(me).collection('messages').doc(id), data);
                        await batch.commit();
                    }
                    return { ...data, id, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + TABLES.messages.ttl).toISOString() };
                }
            },
            rooms: {
                async ensureDefaults() {
                    if (this._defaults) return;
                    const snaps = await Promise.all(Object.keys(DEFAULT_ROOMS).map(id => db.collection('chat_rooms').doc(id).get()));
                    await Promise.all(snaps.filter(snap => !snap.exists).map(snap => snap.ref.set({
                        slug: snap.id, ...DEFAULT_ROOMS[snap.id], visibility: 'public', owner_id: null, activation_minutes: 0,
                        activated_at: FieldValue.serverTimestamp(), created_at: FieldValue.serverTimestamp()
                    }).catch(() => {})));
                    this._defaults = true;
                },
                async select(state, eq) {
                    const rooms = db.collection('chat_rooms'), me = need();
                    if (eq.id !== undefined) { const snap = await rooms.doc(String(eq.id)).get(); return snap.exists ? [toRow(TABLES.chat_rooms, snap)] : []; }
                    await this.ensureDefaults();
                    const [open, mine, invites] = await Promise.all([
                        rooms.where('visibility', '==', 'public').get(),
                        rooms.where('owner_id', '==', me).get(),
                        db.collection('chat_room_invites').where('receiver_id', '==', me).where('status', '==', 'accepted').get()
                    ]);
                    const seen = new Map();
                    for (const doc of [...open.docs, ...mine.docs]) seen.set(doc.id, toRow(TABLES.chat_rooms, doc));
                    const invited = await Promise.all(invites.docs.map(doc => doc.data().room_id).filter(id => id && !seen.has(id)).map(id => rooms.doc(id).get().catch(() => null)));
                    for (const doc of invited) if (doc?.exists) seen.set(doc.id, toRow(TABLES.chat_rooms, doc));
                    return [...seen.values()];
                }
            }
        };

        /* ---------- reading ---------- */
        async function fetchRows(name, state) {
            if (RETIRED.has(name)) return [];
            const cfg = TABLES[name];
            if (!cfg) throw problem(`Table ${name} is not available.`);
            const eq = Object.fromEntries(state.filters.filter(filter => filter.op === 'eq').map(filter => [filter.col, filter.val]));
            if (cfg.special) return SPECIAL[cfg.special].select(state, eq);
            const key = cfg.key || 'id', base = collectionOf(name, cfg, eq);
            if (eq[key] !== undefined && eq[key] !== null) {
                // Other players' hero cards are asked for again and again (one per chat line): remember them for a minute.
                if (name === 'profiles' && eq[key] !== uid()) { const row = await lookup('profiles', eq[key]); return row ? [{ ...row }] : []; }
                const snap = await base.doc(String(eq[key])).get();
                if (!snap.exists) return [];
                if (cfg.chunked) return [{ [key]: snap.id, ...Object.fromEntries(Object.entries(snap.data()).filter(([field]) => !['parts', 'size'].includes(field)).map(([field, value]) => [field, iso(value)])), [cfg.chunked]: await readParts(snap) }];
                return [toRow(cfg, snap)];
            }
            if (cfg.ttl && cfg.parent) tidy(base, cfg);
            const me = uid();
            const equal = Object.entries(eq).filter(([column, value]) => column !== cfg.parent?.[1] && !(cfg.text || []).includes(column) && value !== undefined);
            const scopes = !cfg.scope ? [null] : cfg.scope.some(column => eq[column] === me) ? [null] : cfg.scope;
            const snaps = await Promise.all(scopes.map(column => {
                let query = base, hasEquality = false;
                if (column) { query = query.where(column, '==', need()); hasEquality = true; }
                for (const [field, value] of equal) { query = query.where(field, '==', value); hasEquality = true; }
                query = hasEquality ? query.limit(300) : pushRange(name, cfg, query, state);
                return query.get();
            }));
            const rows = new Map();
            for (const snap of snaps) for (const doc of snap.docs) rows.set(doc.ref.path, toRow(cfg, doc));
            let list = [...rows.values()];
            if (cfg.ttl) {
                const now = Date.now(), dead = list.filter(row => Date.parse(row.expires_at) <= now);
                list = list.filter(row => Date.parse(row.expires_at) > now);
                // Tidy up expired rows that an equality query still returned (the rules allow anyone to remove them).
                for (const row of dead.slice(0, 20)) row.__ref.delete().catch(() => {});
            }
            return list;
        }
        /** Short-lived rows are never shown after their lifetime; now and then a batch of them is removed for good. */
        const tidied = new Map();
        function tidy(base, cfg) {
            const key = base.path || String(base.id || '');
            if (Date.now() - (tidied.get(key) || 0) < 10 * MINUTE) return;
            tidied.set(key, Date.now());
            base.where('created_at', '<', liveBound(cfg)).limit(40).get()
                .then(snap => Promise.all(snap.docs.map(doc => doc.ref.delete().catch(() => {}))))
                .catch(() => {});
        }
        /** One range or one sort can be handed to the database when no equality filter is used. */
        function pushRange(name, cfg, query, state) {
            if (cfg.ttl) return query.where('created_at', '>', liveBound(cfg)).orderBy('created_at', state.order?.ascending ? 'asc' : 'desc').limit(Math.min(state.limit || 100, 100));
            const search = name === 'profiles' && state.filters.find(filter => filter.op === 'ilike' && filter.col === 'display_name');
            if (search) {
                const text = normalName(String(search.val).replace(/%/g, ''));
                if (!String(search.val).includes('%')) return query.where('name_lower', '==', text);
                return query.where('name_lower', '>=', text).where('name_lower', '<=', text + '\uf8ff').limit(20);
            }
            const range = state.filters.find(filter => ['gt', 'gte', 'lt', 'lte'].includes(filter.op));
            if (range) {
                query = query.where(range.col, { gt: '>', gte: '>=', lt: '<', lte: '<=' }[range.op], range.val);
                if (state.order?.col === range.col) query = query.orderBy(range.col, state.order.ascending ? 'asc' : 'desc').limit(Math.min(state.limit || 100, 100));
                return query;
            }
            if (state.order) return query.orderBy(state.order.col, state.order.ascending ? 'asc' : 'desc').limit(Math.min(state.limit || 100, 100));
            return query.limit(200);
        }

        /* ---------- embedded lookups: "sender:profiles!key(display_name)" ---------- */
        function parseRelations(columns) {
            const found = [];
            String(columns || '').replace(/(\w+):(\w+)(?:!\w+)?\(([^)]*)\)/g, (_match, alias, table, fields) => { found.push({ alias, table, fields: fields.split(',').map(field => field.trim()).filter(Boolean) }); return ''; });
            return found;
        }
        async function lookup(table, id) {
            if (!id) return null;
            if (table === 'profiles') {
                const cached = profileCache.get(id);
                if (cached && Date.now() - cached.at < MINUTE) return cached.row;
            }
            const cfg = TABLES[table];
            let row = null;
            try { const snap = await db.collection(table).doc(String(id)).get(); row = snap.exists ? toRow(cfg, snap) : null; } catch { row = null; }
            if (table === 'profiles') profileCache.set(id, { row, at: Date.now() });
            return row;
        }
        async function attachRelations(name, rows, columns) {
            const cfg = TABLES[name];
            for (const relation of parseRelations(columns)) {
                const link = cfg?.rel?.[relation.alias];
                if (!link) continue;
                await Promise.all(rows.map(async row => {
                    const target = await lookup(link[0], row[link[1]]);
                    row[relation.alias] = target ? Object.fromEntries((relation.fields.includes('*') ? Object.keys(target) : relation.fields).map(field => [field, target[field]])) : null;
                }));
            }
            return rows;
        }

        /* ---------- writing ---------- */
        async function insertRow(name, row) {
            if (RETIRED.has(name)) throw problem('This feature is not available in this version.');
            const cfg = TABLES[name];
            if (!cfg) throw problem(`Table ${name} is not available.`);
            if (cfg.special === 'messages') return SPECIAL.messages.insert(row);
            const base = collectionOf(name, cfg, row);
            const id = cfg.docId ? cfg.docId(row) : row.id;
            if (cfg.docId && !id) throw problem(`${name} is missing its key.`);
            const ref = id ? base.doc(String(id)) : base.doc();
            const data = toDoc(name, cfg, row, { insert: true });
            if (cfg.chunked) { const { [cfg.chunked]: value, ...meta } = row; await writeParts(ref, meta, value); return { ...row }; }
            if (cfg.unique) {
                await db.runTransaction(async tx => {
                    const snap = await tx.get(ref);
                    const status = snap.exists ? snap.data().status : null;
                    if (snap.exists && name === 'friend_requests' && status === 'accepted') throw problem('You are already friends with this hero.', 'duplicate');
                    if (snap.exists && (status === undefined || status === 'pending')) throw problem(name === 'guilds' ? 'That name is already taken.' : 'That request was already sent and is still waiting.', 'duplicate');
                    tx.set(ref, data);
                });
            } else await ref.set(data);
            const result = { ...(cfg.defaults || {}), ...row, id: row.id ?? ref.id };
            if (cfg.stamp) result.created_at = new Date().toISOString();
            if (cfg.ttl) result.expires_at = new Date(Date.now() + cfg.ttl).toISOString();
            return result;
        }
        async function targets(name, state) {
            const cfg = TABLES[name];
            if (!cfg) throw problem(`Table ${name} is not available.`);
            const eq = Object.fromEntries(state.filters.filter(filter => filter.op === 'eq').map(filter => [filter.col, filter.val]));
            const key = cfg.key || 'id';
            if (!cfg.special && eq[key] !== undefined && eq[key] !== null) return [collectionOf(name, cfg, eq).doc(String(eq[key]))];
            if (cfg.special === 'rooms' && eq.id) return [db.collection('chat_rooms').doc(String(eq.id))];
            return finish(await fetchRows(name, state), { ...state, order: null, limit: null }).map(row => row.__ref).filter(Boolean);
        }
        const missing = error => /not-found/.test(String(error?.code || '')) || /No document to update/i.test(String(error?.message || ''));

        /* ---------- the query builder ---------- */
        function from(name) {
            const state = { action: 'select', filters: [], order: null, limit: null, columns: '*', one: null, payload: null, returning: false };
            const run = async () => {
                try {
                    let rows;
                    if (state.action === 'select') rows = await attachRelations(name, finish(await fetchRows(name, state), state), state.columns);
                    else if (state.action === 'insert') {
                        rows = [];
                        for (const row of Array.isArray(state.payload) ? state.payload : [state.payload]) rows.push(await insertRow(name, row));
                    } else if (state.action === 'upsert') {
                        if (RETIRED.has(name)) throw problem('This feature is not available in this version.');
                        const cfg = TABLES[name];
                        rows = [];
                        for (const row of Array.isArray(state.payload) ? state.payload : [state.payload]) {
                            const id = cfg.docId ? cfg.docId(row) : row.id;
                            if (!id) throw problem(`${name} is missing its key.`);
                            const ref = collectionOf(name, cfg, row).doc(String(id));
                            if (cfg.chunked) { const { [cfg.chunked]: value, ...meta } = row; await writeParts(ref, meta, value); }
                            else await ref.set(toDoc(name, cfg, row), { merge: true });
                            rows.push({ ...row });
                        }
                    } else if (state.action === 'update') {
                        if (RETIRED.has(name)) throw problem('This feature is not available in this version.');
                        const patch = toDoc(name, TABLES[name] || {}, state.payload);
                        const refs = await targets(name, state);
                        await Promise.all(refs.map(ref => ref.update(patch).catch(error => { if (!missing(error)) throw error; })));
                        if (name === 'profiles') for (const ref of refs) profileCache.delete(ref.id);
                        rows = state.returning ? await attachRelations(name, finish(await fetchRows(name, state), state), state.columns) : null;
                    } else if (state.action === 'delete') {
                        if (RETIRED.has(name)) throw problem('This feature is not available in this version.');
                        const refs = await targets(name, state);
                        await Promise.all(refs.map(ref => ref.delete()));
                        rows = null;
                    }
                    if (state.one) {
                        const list = rows || [];
                        if (state.one === 'single' && list.length !== 1) return { data: null, error: { message: list.length ? 'More than one row was found.' : 'No row was found.', code: 'PGRST116' } };
                        if (list.length > 1) return { data: null, error: { message: 'More than one row was found.', code: 'PGRST116' } };
                        return ok(list[0] || null);
                    }
                    return ok(rows);
                } catch (error) { return fail(error); }
            };
            const add = (op, col, val) => { state.filters.push({ col, op, val }); return builder; };
            const builder = {
                select(columns = '*') { if (state.action === 'select') state.columns = columns; else { state.returning = true; state.columns = columns; } return builder; },
                insert(payload) { state.action = 'insert'; state.payload = payload; return builder; },
                upsert(payload) { state.action = 'upsert'; state.payload = payload; return builder; },
                update(payload) { state.action = 'update'; state.payload = payload; return builder; },
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

        /* ---------- live updates ---------- */
        function listen(spec, callback) {
            const name = spec.table, cfg = TABLES[name];
            if (!cfg) return [];
            const want = spec.event || '*';
            const filter = {};
            String(spec.filter || '').replace(/(\w+)=eq\.([^,]+)/g, (_match, column, value) => { filter[column] = value; return ''; });
            let sources = [];
            try {
                if (cfg.special === 'messages') sources = SPECIAL.messages.queries();
                else if (cfg.special === 'rooms') sources = filter.id ? [db.collection('chat_rooms').doc(filter.id)] : [];
                else if (cfg.parent) { if (filter[cfg.parent[1]]) sources = [collectionOf(name, cfg, filter).where('created_at', '>', liveBound(cfg))]; }
                else if (filter[cfg.key || 'id']) sources = [db.collection(name).doc(filter[cfg.key || 'id'])];
                else if (cfg.scope) sources = cfg.scope.map(column => db.collection(name).where(column, '==', need()));
            } catch { sources = []; }
            const emit = (type, row) => {
                if (want !== '*' && want !== type) return;
                try { callback(type === 'DELETE' ? { eventType: type, new: {}, old: row } : { eventType: type, new: row, old: {} }); } catch (error) { console.warn('live update handler:', error); }
            };
            const watch = source => {
                let first = true;
                return source.onSnapshot(snap => {
                    try {
                        if (typeof snap.docChanges !== 'function') {         // one document
                            if (first) { first = false; return; }
                            emit(snap.exists ? 'UPDATE' : 'DELETE', snap.exists ? toRow(cfg, snap) : { id: snap.id });
                            return;
                        }
                        if (first) { first = false; return; }                // what was already there is loaded by a normal read
                        for (const change of snap.docChanges()) emit({ added: 'INSERT', modified: 'UPDATE', removed: 'DELETE' }[change.type], toRow(cfg, change.doc));
                    } catch (error) { console.warn(`Live update for ${name} could not be read:`, error?.message || error); }
                }, error => console.warn(`Live updates for ${name} stopped:`, error?.code || error?.message || error));
            };
            const stops = sources.map(watch);
            if (cfg.follow && !filter[cfg.parent[1]]) {
                // No group was named: follow every group the caller belongs to, also ones joined later.
                const groups = new Map();
                let memberships;
                try { memberships = db.collection(cfg.follow[0]).where(cfg.follow[1], '==', need()); } catch { return stops; }
                stops.push(memberships.onSnapshot(snap => {
                    const wanted = new Set(snap.docs.map(doc => doc.data()[cfg.parent[1]]).filter(Boolean));
                    for (const [group, stop] of groups) if (!wanted.has(group)) { stop(); groups.delete(group); }
                    for (const group of wanted) if (!groups.has(group)) groups.set(group, watch(collectionOf(name, cfg, { [cfg.parent[1]]: group }).where('created_at', '>', stampAt(Date.now() - 5000))));
                }, error => console.warn(`Live updates for ${name} stopped:`, error?.code || error?.message || error)));
                stops.push(() => { for (const stop of groups.values()) stop(); groups.clear(); });
            }
            return stops;
        }
        function channel() {
            const wanted = [];
            let stops = [];
            const live = {
                on(_kind, spec, callback) { wanted.push([spec, callback]); return live; },
                subscribe(report) { for (const [spec, callback] of wanted) stops.push(...listen(spec, callback)); try { report?.('SUBSCRIBED'); } catch { /* optional */ } return live; },
                unsubscribe() { for (const stop of stops) { try { stop(); } catch { /* already stopped */ } } stops = []; return Promise.resolve('ok'); }
            };
            return live;
        }

        /* ---------- server functions, now run through transactions ---------- */
        const profileRef = id => db.collection('profiles').doc(id);
        const newCode = () => {
            try { const kept = globalThis.localStorage?.getItem('black_sword_guest_code'); if (/^KND-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(kept || '')) return kept; } catch { /* private mode */ }
            const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', part = () => Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
            return `KND-${part()}-${part()}`;
        };
        const codes = new Map();
        /** The private Player ID (login secret). Kept apart from the public profile. */
        async function accountCode() {
            const me = need();
            if (codes.has(me)) return codes.get(me);
            const ref = db.collection('accounts').doc(me), snap = await ref.get();
            let code = snap.exists ? snap.data().player_code : null;
            if (!code) { code = newCode(); await ref.set({ player_code: code, created_at: FieldValue.serverTimestamp() }, { merge: true }); }
            codes.set(me, code);
            return code;
        }
        const myNames = async () => (await db.collection('hero_names').where('owner_id', '==', need()).get()).docs;
        async function recoveryId(code, pin) {
            const subtle = globalThis.crypto?.subtle;
            if (!subtle) throw problem('Player ID and PIN need a secure (https) page.');
            const encode = text => new TextEncoder().encode(text);
            const key = await subtle.importKey('raw', encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
            const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encode('black-sword-recovery:' + String(code).toUpperCase()), iterations: 150000 }, key, 256);
            return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        }
        const roomRef = id => db.collection('chat_rooms').doc(String(id));
        const activeMembers = async id => (await roomRef(id).collection('members').where('last_seen', '>', stampAt(Date.now() - ROOM_ACTIVE_MS)).get()).size;
        let recoveryCopyAt = 0;

        const RPC = {
            async get_my_profile() {
                const me = need(), ref = profileRef(me);
                let snap = await ref.get();
                if (!snap.exists) {
                    const user = auth.currentUser, name = String(user?.displayName || user?.providerData?.[0]?.displayName || 'Wandering Hero').slice(0, 40);
                    await ref.set({ id: me, display_name: name, name_lower: normalName(name), level: 1, current_location: 'Kaliwasch City', last_seen: new Date().toISOString(), created_at: FieldValue.serverTimestamp() });
                    snap = await ref.get();
                }
                const row = toRow(TABLES.profiles, snap);
                row.player_code = await accountCode();
                return row;
            },
            async has_linked_identity() { return Boolean(auth.currentUser && !auth.currentUser.isAnonymous); },

            async hero_name_available({ desired_name }) {
                const name = nameKey(desired_name);
                if (name.length < 2) return false;
                const snap = await db.collection('hero_names').doc(name).get();
                return !snap.exists || snap.data().owner_id === need();
            },
            async reserve_hero_name({ desired_name, target_slot }) {
                const me = need(), display = String(desired_name || '').trim(), name = nameKey(display), slot = String(target_slot || '');
                if (name.length < 2 || name.length > 40) throw problem('A hero name needs between 2 and 40 characters.');
                const ref = db.collection('hero_names').doc(name), older = (await myNames()).filter(doc => doc.data().hero_slot === slot && doc.id !== name);
                await db.runTransaction(async tx => {
                    const snap = await tx.get(ref);
                    if (snap.exists && snap.data().owner_id !== me) throw problem('That hero name is already taken. Please choose another.', 'duplicate');
                    tx.set(ref, { owner_id: me, hero_slot: slot, hero_name: display, normalized_name: name, created_at: FieldValue.serverTimestamp() });
                    for (const doc of older) tx.delete(doc.ref);
                });
                return true;
            },
            async release_hero_name({ target_slot }) {
                const docs = (await myNames()).filter(doc => doc.data().hero_slot === String(target_slot || ''));
                await Promise.all(docs.map(doc => doc.ref.delete()));
                return docs.length;
            },
            async release_all_hero_names() { const docs = await myNames(); await Promise.all(docs.map(doc => doc.ref.delete())); return docs.length; },
            async find_heroes_by_name({ hero_name }) {
                const name = normalName(hero_name);
                if (name.length < 2) return [];
                const [byProfile, registered] = await Promise.all([db.collection('profiles').where('name_lower', '==', name).limit(5).get(), db.collection('hero_names').doc(nameKey(hero_name)).get()]);
                const found = new Map(byProfile.docs.map(doc => [doc.id, toRow(TABLES.profiles, doc)]));
                const owner = registered.exists ? registered.data().owner_id : null;
                if (owner && !found.has(owner)) { const row = await lookup('profiles', owner); if (row) found.set(owner, { ...row, display_name: registered.data().hero_name || row.display_name }); }
                return [...found.values()].map(({ id, display_name, level, current_location, last_seen }) => ({ id, display_name, level, current_location, last_seen }));
            },

            async submit_game_feedback({ feedback_category, feedback_message }) {
                const me = need(), message = String(feedback_message || '').trim();
                if (message.length < 3 || message.length > 2000) throw problem('Feedback needs between 3 and 2000 characters.');
                const mine = await lookup('profiles', me);
                const ref = db.collection('game_feedback').doc();
                await ref.set({ user_id: me, display_name: mine?.display_name || 'Hero', category: String(feedback_category || 'gameplay').slice(0, 40), kind: /bug/i.test(String(feedback_category)) ? 'bug' : 'feedback', message, status: 'new', resolution_note: '', created_at: FieldValue.serverTimestamp() });
                return ref.id;
            },
            async list_moderator_feedback({ row_limit = 50 } = {}) {
                try {
                    const snap = await db.collection('game_feedback').orderBy('created_at', 'desc').limit(Math.min(Number(row_limit) || 50, 100)).get();
                    return snap.docs.map(doc => { const row = toRow(TABLES.game_feedback, doc); return { ...row, feedback_id: row.id, sender_id: row.display_name || row.user_id }; });
                } catch (error) { if (/permission/i.test(String(error?.code || error?.message))) throw problem(`Not authorized: this account is not a moderator. Account number: ${need()}`, 'permission-denied'); throw error; }
            },
            async moderate_game_feedback({ feedback_id, new_status, private_note }) {
                await db.collection('game_feedback').doc(String(feedback_id)).update({ status: String(new_status || 'reviewed').slice(0, 20), resolution_note: String(private_note || '').slice(0, 1000), assigned_to: need(), updated_at: new Date().toISOString() });
                return true;
            },

            async take_world_drop({ drop_uuid }) {
                const ref = db.collection('world_drops').doc(String(drop_uuid));
                return db.runTransaction(async tx => {
                    const snap = await tx.get(ref);
                    if (!snap.exists) throw problem('Someone else already took that item.');
                    const row = toRow(TABLES.world_drops, snap);
                    if (Date.parse(row.expires_at) <= Date.now()) { tx.delete(ref); throw problem('That item is no longer there.'); }
                    tx.delete(ref);
                    return { id: row.id, item_id: row.item_id, item_snapshot: row.item_snapshot, quantity: row.quantity };
                });
            },

            async set_player_recovery_pin({ new_pin, current_save }) {
                const me = need();
                if (!/^\d{6}$/.test(String(new_pin))) throw problem('PIN must be exactly 6 digits.');
                const profile = await RPC.get_my_profile(), id = await recoveryId(profile.player_code, new_pin);
                const saveRef = db.collection('game_saves').doc(me), previous = (await saveRef.get()).data()?.recovery_ref;
                await writeParts(db.collection('player_recovery').doc(id), { owner_id: me, updated_at: new Date().toISOString() }, current_save || {});
                await saveRef.set({ user_id: me, recovery_ref: id }, { merge: true });
                if (previous && previous !== id) await db.collection('player_recovery').doc(previous).delete().catch(() => {});
                recoveryCopyAt = Date.now();
                return true;
            },
            async update_recovery_save({ current_save }) {
                // The PIN copy is refreshed at most every ten minutes to save free-plan writes.
                if (Date.now() - recoveryCopyAt < 10 * MINUTE) return false;
                const me = need(), reference = (await db.collection('game_saves').doc(me).get()).data()?.recovery_ref;
                recoveryCopyAt = Date.now();
                if (!reference) return false;
                await writeParts(db.collection('player_recovery').doc(reference), { owner_id: me, updated_at: new Date().toISOString() }, current_save || {});
                return true;
            },
            async recover_progress_with_pin({ code, supplied_pin }) {
                need();
                const snap = await db.collection('player_recovery').doc(await recoveryId(code, supplied_pin)).get();
                if (!snap.exists) throw problem('Invalid Player ID or PIN.');
                return readParts(snap);
            },

            async ensure_personal_chat_room() {
                const me = need(), ref = roomRef(`personal_${me}`);
                await SPECIAL.rooms.ensureDefaults();
                if (!(await ref.get()).exists) {
                    const mine = await lookup('profiles', me);
                    await ref.set({ slug: `personal-${me}`, name: `${mine?.display_name || 'Hero'}'s Room`.slice(0, 40), visibility: 'personal', language: 'en-US', owner_id: me, member_limit: 20, activation_minutes: 0, activated_at: FieldValue.serverTimestamp(), created_at: FieldValue.serverTimestamp() });
                }
                return ref.id;
            },
            async create_custom_chat_room({ room_name, room_visibility, max_users, wait_minutes }) {
                const me = need(), name = String(room_name || '').trim().slice(0, 40);
                if (auth.currentUser.isAnonymous) throw problem('Sign in with Google to create a chat room.');
                if (name.length < 2) throw problem('Enter a room name.');
                const ref = db.collection('chat_rooms').doc(), wait = [0, 5, 10].includes(Number(wait_minutes)) ? Number(wait_minutes) : 5;
                await ref.set({ slug: `${slug(name)}-${ref.id.slice(0, 6)}`, name, visibility: room_visibility === 'private' ? 'private' : 'public', language: 'en-US', owner_id: me, member_limit: Math.max(2, Math.min(200, Math.floor(Number(max_users)) || 20)), activation_minutes: wait, activation_started_at: FieldValue.serverTimestamp(), activated_at: wait === 0 ? FieldValue.serverTimestamp() : null, created_at: FieldValue.serverTimestamp() });
                return ref.id;
            },
            async join_chat_room({ target_room }) {
                const me = need(), ref = roomRef(target_room), snap = await ref.get();
                if (!snap.exists) throw problem('That room no longer exists.');
                const room = snap.data();
                const banned = await ref.collection('blacklist').doc(me).get().catch(() => null);
                if (banned?.exists) throw problem('The room owner has blocked you from this room.');
                if (room.owner_id !== me && await activeMembers(target_room) >= (Number(room.member_limit) || 20)) throw problem('That room is full.');
                await ref.collection('members').doc(me).set({ user_id: me, role: room.owner_id === me ? 'owner' : 'member', joined_at: FieldValue.serverTimestamp(), last_seen: FieldValue.serverTimestamp() });
                return 1;
            },
            async chat_room_heartbeat({ target_room }) {
                const me = need(), ref = roomRef(target_room);
                await ref.collection('members').doc(me).set({ user_id: me, last_seen: FieldValue.serverTimestamp() }, { merge: true });
                const [snap, users] = await Promise.all([ref.get(), activeMembers(target_room)]);
                const room = snap.exists ? toRow(TABLES.chat_rooms, snap) : {};
                let activated = Boolean(room.activated_at) || Number(room.activation_minutes) === 0;
                const started = room.activation_started_at || room.created_at;
                if (!activated && room.owner_id === me && started && Date.now() - Date.parse(started) >= Number(room.activation_minutes) * MINUTE) {
                    await ref.update({ activated_at: FieldValue.serverTimestamp() });
                    activated = true;
                }
                return { users: Math.max(1, users), activated, activation_started_at: started || null };
            },
            async blacklist_chat_user({ target_room, target_user, block_reason }) {
                const me = need(), ref = roomRef(target_room);
                await ref.collection('blacklist').doc(String(target_user)).set({ blocked_user_id: String(target_user), blocked_by: me, reason: String(block_reason || '').slice(0, 200), created_at: FieldValue.serverTimestamp() });
                await ref.collection('members').doc(String(target_user)).delete().catch(() => {});
                return true;
            },

            /** Expired chat lines are never shown; this removes a batch of them so the database stays small. */
            async tidy_expired_chat() {
                const me = need(), bound = liveBound(TABLES.messages);
                const snaps = await Promise.all([db.collection('public_messages'), db.collection('inbox').doc(me).collection('messages')].map(collection => collection.where('created_at', '<', bound).limit(40).get().catch(() => ({ docs: [] }))));
                const docs = snaps.flatMap(snap => snap.docs);
                await Promise.all(docs.map(doc => doc.ref.delete().catch(() => {})));
                return docs.length;
            }
        };
        const UNAVAILABLE = /^(create_trade_offer|list_trade_offers|respond_trade_offer|accept_trade_offer|create_game_hall_session|join_game_hall_session|update_game_hall_state)$/;

        async function rpc(name, params = {}) {
            try {
                if (UNAVAILABLE.test(name)) throw problem('This feature is not available in this version.', 'unavailable-feature');
                if (!RPC[name]) throw problem(`function ${name} is not available`, 'unknown-function');
                return ok(await RPC[name](params || {}));
            } catch (error) { return fail(error); }
        }

        return { from, rpc, channel, removeChannel: live => live?.unsubscribe?.() || Promise.resolve('ok'), tables: Object.keys(TABLES) };
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
                    // The rules read the sign-in method from the token, so make sure it is current.
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
        const offline = message => ({ data: null, error: { message, code: 'no-database' } });
        let data;
        if (typeof sdk.firestore === 'function') data = createDataClient(sdk, auth);
        else {
            const message = 'The online database could not be loaded on this network.';
            const dead = new Proxy({}, { get: (_target, key) => key === 'then' ? (resolve => resolve(offline(message))) : () => dead });
            data = { from: () => dead, rpc: async () => offline(message), channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe: async () => 'ok' }), removeChannel: async () => 'ok', tables: [] };
        }
        return { auth: createAuth(sdk, auth), ...data, provider: 'firebase' };
    }

    globalThis.BlackSwordBackend = Object.freeze({
        createClient: config => (config?.provider === 'firebase' && config.firebase ? createClient(config) : Promise.resolve(null)),
        wrapUser, slug, normalName, nameKey
    });
})();
