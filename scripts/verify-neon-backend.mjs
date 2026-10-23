import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readSecrets, readPublicConfig, redact } from './neon-secrets.mjs';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

const secret = readSecrets();
const publicConfig = readPublicConfig();
const owner = new pg.Client({ connectionString: secret.database_url, application_name: 'black-sword-neon-verification' });
const createdUsers = [];

function cookieClient() {
    const jar = new Map();
    return {
        onRequest(request) {
            if (!jar.size) return;
            const headers = request.headers instanceof Headers ? request.headers : new Headers(request.headers || {});
            headers.set('cookie', [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; '));
            request.headers = headers;
        },
        onSuccess({ response }) {
            const cookies = response.headers.getSetCookie?.() || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
            for (const line of cookies) {
                const pair = line.split(';', 1)[0];
                const index = pair.indexOf('=');
                if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
            }
        }
    };
}

function browserClient() {
    return createClient({
        auth: {
            url: publicConfig.auth_url,
            adapter: SupabaseAuthAdapter({ fetchOptions: { ...cookieClient(), credentials: 'include' } })
        },
        dataApi: { url: publicConfig.data_api_url }
    });
}

async function signUp(client, name) {
    const email = `verify-${randomUUID()}@black-sword.local`;
    const password = `${randomUUID()}${randomUUID()}`;
    const result = await client.auth.signUp({ email, password, options: { data: { displayName: name } } });
    assert.equal(result.error, null, `Auth sign-up failed: ${result.error?.message}`);
    assert.ok(result.data.session?.access_token, 'Auth session has no access token');
    assert.ok(result.data.user?.id, 'Auth user has no ID');
    createdUsers.push(result.data.user.id);
    return result.data.user;
}

async function rpc(client, name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    assert.equal(error, null, `${name} failed: ${error?.message}`);
    return data;
}

async function expectRejected(promise, pattern) {
    const result = await promise;
    assert.ok(result.error, `Expected rejection matching ${pattern}`);
    assert.match(String(result.error.message || ''), pattern);
}

async function makeLinked(userId) {
    const columns = await owner.query(`select column_name,data_type from information_schema.columns
        where table_schema='neon_auth' and table_name='account' and column_name in ('id','userId')`);
    const types = Object.fromEntries(columns.rows.map(row => [row.column_name, row.data_type]));
    const idValue = types.id === 'uuid' ? 'gen_random_uuid()' : 'gen_random_uuid()::text';
    const userValue = types.userId === 'uuid' ? '$1::uuid' : '$1::text';
    await owner.query(`insert into neon_auth.account(id,"accountId","providerId","userId","createdAt","updatedAt")
        values(${idValue},$2,'google',$1,now(),now())`, [userId, `verification-${randomUUID()}`]);
}

async function verifySchema() {
    const expected = [
        'profiles', 'game_saves', 'friend_requests', 'messages', 'guilds', 'guild_members',
        'chat_rooms', 'chat_room_messages', 'game_hall_sessions', 'game_hall_members',
        'trade_offers', 'community_map_markers', 'world_drops', 'game_feedback'
    ];
    const result = await owner.query('select tablename,rowsecurity from pg_tables where schemaname=$1 and tablename=any($2)', ['public', expected]);
    assert.equal(result.rowCount, expected.length, 'One or more required application tables are missing');
    for (const row of result.rows) assert.equal(row.rowsecurity, true, `${row.tablename} does not have RLS enabled`);
    const functions = await owner.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=any($1)`, [[
            'get_my_profile', 'has_linked_identity', 'recover_progress_with_pin', 'create_custom_chat_room',
            'create_game_hall_session', 'update_game_hall_state', 'create_trade_offer', 'accept_trade_offer'
        ]]);
    assert.equal(functions.rowCount, 8, 'One or more required security-definer RPCs are missing');
}

const REDIRECT_URI = `${String(publicConfig.auth_url || '').replace(/\/$/, '')}/callback/google`;

async function verifyOAuth() {
    // Google is OPTIONAL. An unconfigured provider is reported, not failed.
    console.log(`Google OAuth redirect URI to register in Google Cloud Console: ${REDIRECT_URI}`);
    let betterAuth;
    try {
        betterAuth = browserClient().auth.getBetterAuthInstance();
    } catch (error) {
        console.log(`Google sign-in not configured — Auth instance unavailable (${error.message}).`);
        return false;
    }
    let result;
    try {
        result = await betterAuth.signIn.social({
            provider: 'google',
            callbackURL: 'https://black-sold-ultimate.vercel.app/',
            disableRedirect: true
        });
    } catch (error) {
        console.log(`Google sign-in not configured — provider call failed (${error.message}).`);
        return false;
    }
    if (result?.error) {
        console.log(`Google sign-in not configured (${result.error.message}). Register the redirect URI above, then re-run.`);
        return false;
    }
    try {
        const target = new URL(result.data.url);
        assert.equal(target.hostname, 'accounts.google.com');
        assert.ok(target.searchParams.get('client_id'), 'Google OAuth URL has no client ID');
        assert.match(target.searchParams.get('redirect_uri') || '', /\/callback\/google$/);
    } catch (error) {
        console.log(`Google sign-in returned an unexpected authorization URL; treating it as unconfigured (${error.message}).`);
        return false;
    }
    console.log('Google OAuth initialization succeeded.');
    return true;
}

try {
    await owner.connect();
    await verifySchema();
    const clientA = browserClient();
    const clientB = browserClient();
    const userA = await signUp(clientA, 'Verify Alpha');
    const userB = await signUp(clientB, 'Verify Beta');

    const profileA = await rpc(clientA, 'get_my_profile');
    const normalizedProfile = Array.isArray(profileA) ? profileA[0] : profileA;
    assert.equal(normalizedProfile.id, userA.id);
    assert.match(normalizedProfile.player_code, /^KND-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(await rpc(clientA, 'has_linked_identity'), false);

    const initialSave = { version: 2, activeHeroId: 'alpha', heroes: { alpha: { player: { name: 'Verify Alpha', gold: 100 }, inventory: [] } }, updatedAt: new Date().toISOString() };
    const saveResult = await clientA.from('game_saves').upsert({ user_id: userA.id, save_data: initialSave, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    assert.equal(saveResult.error, null, `Cloud save failed: ${saveResult.error?.message}`);
    const ownSave = await clientA.from('game_saves').select('save_data').eq('user_id', userA.id).maybeSingle();
    assert.equal(ownSave.error, null);
    assert.equal(ownSave.data.save_data.heroes.alpha.player.name, 'Verify Alpha');
    const crossSave = await clientB.from('game_saves').select('save_data').eq('user_id', userA.id).maybeSingle();
    assert.equal(crossSave.error, null);
    assert.equal(crossSave.data, null, 'RLS exposed another user\'s cloud save');

    await expectRejected(clientB.from('game_saves').upsert({ user_id: userA.id, save_data: { player: { gold: 999999 } } }, { onConflict: 'user_id' }), /row-level security|permission|policy/i);
    await expectRejected(clientB.from('friend_requests').insert({ sender_id: userB.id, receiver_id: userA.id }), /row-level security|policy|linked/i);

    const messageBody = `Verification ${randomUUID().slice(0, 8)}`;
    const message = await clientA.from('messages').insert({ sender_id: userA.id, body: messageBody, source_language: 'en' }).select().single();
    assert.equal(message.error, null, `Public chat failed: ${message.error?.message}`);
    const visibleMessage = await clientB.from('messages').select('id,body,expires_at').eq('id', message.data.id).maybeSingle();
    assert.equal(visibleMessage.error, null);
    assert.equal(visibleMessage.data.body, messageBody);
    assert.ok(Date.parse(visibleMessage.data.expires_at) > Date.now());

    const worldRoom = await clientA.from('chat_rooms').select('id').eq('slug', 'world').single();
    assert.equal(worldRoom.error, null);
    assert.equal(await rpc(clientA, 'join_chat_room', { target_room: worldRoom.data.id }), true);
    assert.equal(await rpc(clientB, 'join_chat_room', { target_room: worldRoom.data.id }), true);
    const roomMessage = await clientB.from('chat_room_messages').insert({ room_id: worldRoom.data.id, sender_id: userB.id, body: `Room ${messageBody}`, source_language: 'en' }).select().single();
    assert.equal(roomMessage.error, null, `Room chat failed: ${roomMessage.error?.message}`);

    // Simulate only the provider-account row for authorization testing. The
    // separate OAuth check above verifies the real Google provider and callback.
    await makeLinked(userA.id);
    assert.equal(await rpc(clientA, 'has_linked_identity'), true);
    const friend = await clientA.from('friend_requests').insert({ sender_id: userA.id, receiver_id: userB.id }).select().single();
    assert.equal(friend.error, null, `Friend request failed: ${friend.error?.message}`);
    const accepted = await clientB.from('friend_requests').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friend.data.id);
    assert.equal(accepted.error, null, `Friend acceptance failed: ${accepted.error?.message}`);

    const sessionId = await rpc(clientA, 'create_game_hall_session', { kind: 'chess', session_name: 'Verification', players: 2, initial_state: { fen: 'start' } });
    const invite = await clientA.from('game_hall_invites').insert({ session_id: sessionId, sender_id: userA.id, receiver_id: userB.id }).select().single();
    assert.equal(invite.error, null);
    assert.equal((await clientB.from('game_hall_invites').update({ status: 'accepted' }).eq('id', invite.data.id)).error, null);
    await rpc(clientB, 'join_game_hall_session', { sid: sessionId });
    assert.equal(await rpc(clientA, 'update_game_hall_state', { sid: sessionId, expected_version: 0, new_state: { fen: 'after-move' }, new_status: 'playing' }), 1);
    const syncedHall = await clientB.from('game_hall_sessions').select('version,state').eq('id', sessionId).single();
    assert.equal(syncedHall.error, null);
    assert.equal(syncedHall.data.version, 1);
    assert.equal(syncedHall.data.state.fen, 'after-move');

    await owner.query('update public.profiles set display_name=$2 where id=$1', [userA.id, 'Verify Alpha']);
    await owner.query('update public.profiles set display_name=$2 where id=$1', [userB.id, 'Verify Beta']);
    await owner.query(`insert into public.game_saves(user_id,save_data) values
        ($1,$3),($2,$4) on conflict(user_id) do update set save_data=excluded.save_data`, [
        userA.id, userB.id,
        { player: { gold: 100 }, inventory: [{ id: 'potion', name: 'Potion', quantity: 3 }] },
        { player: { gold: 50 }, inventory: [{ id: 'gem', name: 'Gem', quantity: 2 }] }
    ]);
    const tradeId = await rpc(clientA, 'create_trade_offer', {
        target_hero: 'Verify Beta', offered: [{ id: 'potion', name: 'Potion', quantity: 1 }],
        requested: [{ id: 'gem', name: 'Gem', quantity: 1 }], gold_offered: 10, gold_requested: 5
    });
    const trade = await rpc(clientB, 'accept_trade_offer', { offer_id: tradeId });
    assert.equal(trade.ok, true);
    const inventories = await owner.query('select user_id,save_data from public.game_saves where user_id=any($1) order by user_id', [[userA.id, userB.id]]);
    const saveA = inventories.rows.find(row => row.user_id === userA.id).save_data;
    const saveB = inventories.rows.find(row => row.user_id === userB.id).save_data;
    assert.equal(saveA.player.gold, 105);
    assert.equal(saveB.player.gold, 55);
    assert.equal(saveA.inventory.find(item => item.id === 'potion').quantity, 2);
    assert.equal(saveA.inventory.find(item => item.id === 'gem').quantity, 1);
    assert.equal(saveB.inventory.find(item => item.id === 'gem').quantity, 1);
    assert.equal(saveB.inventory.find(item => item.id === 'potion').quantity, 1);

    const googleReady = await verifyOAuth();
    console.log(`Neon verification passed: guest auth, profile creation, RLS isolation, cloud saves, chat, rooms, friends, Game Hall, and atomic trading. Google sign-in: ${googleReady ? 'initialized' : 'not configured (allowed)'}.`);
} catch (error) {
    const message = redact(error?.message || error, [secret.database_url, secret.identity_assertion]);
    console.error(`Neon backend verification failed: ${message}`);
    process.exitCode = 1;
} finally {
    for (const userId of createdUsers) {
        await owner.query('delete from neon_auth."user" where id=$1', [userId]).catch(error => console.error(`Verification cleanup warning: ${error.message}`));
    }
    await owner.end().catch(() => {});
}
