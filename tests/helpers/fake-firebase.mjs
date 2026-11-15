// A small in-memory stand-in for the Firebase compat SDK (Auth + Cloud Firestore).
// It keeps the one Firestore restriction that matters for the free plan:
// a query that mixes an equality filter with a range or sort on ANOTHER field
// needs a hand-made composite index, so the fake refuses it.
export class Timestamp {
    constructor(ms) { this.ms = ms; }
    static fromMillis(ms) { return new Timestamp(ms); }
    toDate() { return new Date(this.ms); }
    toMillis() { return this.ms; }
    valueOf() { return this.ms; }
}
const SERVER_TIME = { __sentinel: 'serverTimestamp' };
const clone = value => {
    if (value === SERVER_TIME) return new Timestamp(Date.now());
    if (value instanceof Timestamp || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, clone(inner)]));
};
const rank = value => (value instanceof Timestamp ? value.ms : value);
const failure = (code, message) => Object.assign(new Error(message), { code });

export function createFakeFirestore() {
    const store = new Map();                    // path → data
    const watchers = new Set();
    const stats = { reads: 0, writes: 0, deletes: 0 };
    let counter = 0;
    const notify = () => { for (const watcher of [...watchers]) watcher(); };
    const snapshotOf = ref => {
        const data = store.get(ref.path);
        return { exists: data !== undefined, id: ref.id, ref, data: () => (data === undefined ? undefined : clone(data)) };
    };
    const write = (path, data, merge) => {
        if (JSON.stringify(data, (_key, value) => (value instanceof Timestamp ? 0 : value)).length > 1000000) throw failure('invalid-argument', 'Document exceeds the maximum size.');
        for (const value of Object.values(data)) if (Array.isArray(value) && value.some(Array.isArray)) throw failure('invalid-argument', 'Nested arrays are not supported.');
        store.set(path, merge ? { ...(store.get(path) || {}), ...clone(data) } : clone(data));
        stats.writes++;
    };
    function doc(path) {
        const id = path.split('/').pop();
        if (!id || id.includes('/') || /^\.+$/.test(id)) throw failure('invalid-argument', `Invalid document path ${path}`);
        const ref = {
            id, path,
            collection: name => collection(`${path}/${name}`),
            async get() { stats.reads++; return snapshotOf(ref); },
            async set(data, options = {}) { write(path, data, options.merge); notify(); },
            async update(data) { if (!store.has(path)) throw failure('not-found', 'No document to update'); write(path, data, true); notify(); },
            async delete() { store.delete(path); stats.deletes++; notify(); },
            onSnapshot(next) {
                let last;
                const check = () => { const now = JSON.stringify(store.get(path) ?? null); if (now !== last) { last = now; next(snapshotOf(ref)); } };
                const watcher = () => queueMicrotask(check);
                watchers.add(watcher); watcher();
                return () => watchers.delete(watcher);
            }
        };
        return ref;
    }
    function query(path, filters = [], order = null, max = null) {
        const run = () => {
            const equalities = filters.filter(filter => filter.op === '==').map(filter => filter.field);
            const ranged = [...new Set(filters.filter(filter => filter.op !== '==').map(filter => filter.field))];
            if (ranged.length > 1) throw failure('invalid-argument', 'Range filters on more than one field.');
            const sortField = order?.field || ranged[0];
            if (equalities.length && sortField && !equalities.includes(sortField)) throw failure('failed-precondition', 'The query requires an index.');
            if (order && ranged[0] && order.field !== ranged[0]) throw failure('invalid-argument', 'First sort must be on the range field.');
            const depth = path.split('/').length + 1;
            let rows = [...store.entries()].filter(([key]) => key.startsWith(path + '/') && key.split('/').length === depth).map(([key, data]) => ({ key, data }));
            rows = rows.filter(({ data }) => filters.every(({ field, op, value }) => {
                const have = data[field];
                if (op === '==') return have === value || (have !== undefined && rank(have) === rank(value));
                if (have === undefined || have === null || typeof rank(have) !== typeof rank(value)) return false;
                return op === '>' ? rank(have) > rank(value) : op === '>=' ? rank(have) >= rank(value) : op === '<' ? rank(have) < rank(value) : rank(have) <= rank(value);
            }));
            if (sortField) {
                rows = rows.filter(({ data }) => data[sortField] !== undefined);
                rows.sort((a, b) => (rank(a.data[sortField]) > rank(b.data[sortField]) ? 1 : rank(a.data[sortField]) < rank(b.data[sortField]) ? -1 : 0) * (order?.dir === 'desc' ? -1 : 1));
            }
            if (max) rows = rows.slice(0, max);
            return rows.map(({ key }) => snapshotOf(doc(key)));
        };
        return {
            where: (field, op, value) => query(path, [...filters, { field, op, value }], order, max),
            orderBy: (field, dir = 'asc') => query(path, filters, { field, dir }, max),
            limit: count => query(path, filters, order, count),
            async get() { const docs = run(); stats.reads += Math.max(1, docs.length); return { docs, size: docs.length, empty: !docs.length }; },
            onSnapshot(next, onError) {
                let before = new Map();
                const check = () => {
                    let docs;
                    try { docs = run(); } catch (error) { onError?.(error); return; }
                    const now = new Map(docs.map(snap => [snap.ref.path, { text: JSON.stringify(snap.data()), data: snap.data() }]));
                    const changes = [];
                    for (const snap of docs) { const old = before.get(snap.ref.path); if (old === undefined) changes.push({ type: 'added', doc: snap }); else if (old.text !== now.get(snap.ref.path).text) changes.push({ type: 'modified', doc: snap }); }
                    for (const [key, old] of before) if (!now.has(key)) changes.push({ type: 'removed', doc: { ...snapshotOf(doc(key)), data: () => clone(old.data) } });
                    const first = before.size === 0 && !check.ran;
                    check.ran = true;
                    if (!first && !changes.length) return;
                    before = now;
                    next({ docs, size: docs.length, docChanges: () => changes });
                };
                const watcher = () => queueMicrotask(check);
                watchers.add(watcher); watcher();
                return () => watchers.delete(watcher);
            }
        };
    }
    function collection(path) {
        return { ...query(path), path, id: path.split('/').pop(), doc: id => doc(`${path}/${id || 'auto' + String(++counter).padStart(6, '0')}`) };
    }
    const db = {
        collection,
        batch() {
            const steps = [];
            return {
                set: (ref, data, options = {}) => steps.push(() => write(ref.path, data, options.merge)),
                update: (ref, data) => steps.push(() => write(ref.path, data, true)),
                delete: ref => steps.push(() => { store.delete(ref.path); stats.deletes++; }),
                async commit() { for (const step of steps) step(); notify(); }
            };
        },
        async runTransaction(work) {
            const steps = [];
            const result = await work({
                get: async ref => { stats.reads++; return snapshotOf(ref); },
                set: (ref, data, options = {}) => steps.push(() => write(ref.path, data, options.merge)),
                update: (ref, data) => steps.push(() => write(ref.path, data, true)),
                delete: ref => steps.push(() => { store.delete(ref.path); stats.deletes++; })
            });
            for (const step of steps) step();
            notify();
            return result;
        }
    };
    return { db, store, stats };
}

/** One signed-in device. Several devices can share one database. */
export function createFakeSdk(shared, user) {
    const listeners = new Set();
    const auth = {
        currentUser: user || null,
        onAuthStateChanged(callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); },
        async signInAnonymously() { auth.currentUser = { uid: 'guest-' + Math.random().toString(36).slice(2, 8), isAnonymous: true, providerData: [], displayName: null, getIdToken: async () => 'token' }; for (const callback of listeners) callback(auth.currentUser); return { user: auth.currentUser }; },
        async signOut() { auth.currentUser = null; for (const callback of listeners) callback(null); },
        async signInWithPopup() { auth.currentUser = sdk.nextGoogleUser; for (const callback of listeners) callback(auth.currentUser); return { user: auth.currentUser }; },
        async signInWithCredential() { return auth.signInWithPopup(); }
    };
    const sdk = { apps: [{}], initializeApp() {}, auth: () => auth, firestore: () => shared.db, nextGoogleUser: null };
    sdk.auth.GoogleAuthProvider = class { setCustomParameters() {} };
    sdk.firestore.FieldValue = { serverTimestamp: () => SERVER_TIME };
    sdk.firestore.Timestamp = Timestamp;
    return sdk;
}
export const googleUser = (uid, name) => ({ uid, isAnonymous: false, displayName: name, email: `${uid}@example.test`, providerData: [{ providerId: 'google.com', displayName: name, email: `${uid}@example.test` }], getIdToken: async () => 'token' });
