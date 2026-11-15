// The Firebase backend: sign-in shape, and every online feature the game uses,
// run against an in-memory stand-in for Cloud Firestore (two players, one database).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createFakeFirestore, createFakeSdk, googleUser } from './helpers/fake-firebase.mjs';

vm.runInThisContext(readFileSync('firebase-backend.js', 'utf8'), { filename: 'firebase-backend.js' });
const Backend = globalThis.BlackSwordBackend;
const config = sdk => ({ provider: 'firebase', firebase: { projectId: 'test' }, firebaseSdk: sdk });
const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));

async function world() {
    const shared = createFakeFirestore();
    const join = async (uid, name) => {
        const sdk = createFakeSdk(shared, googleUser(uid, name));
        const client = await Backend.createClient(config(sdk));
        const { data: profile, error } = await client.rpc('get_my_profile');
        assert.equal(error, null);
        return { client, uid, profile, sdk };
    };
    return { shared, join, asha: await join('asha', 'Asha'), ravi: await join('ravi', 'Ravi') };
}
const good = result => { assert.equal(result.error, null, result.error?.message); return result.data; };

test('a Google player is recognised as signed in, with the id the game expects', async () => {
    const shared = createFakeFirestore();
    const sdk = createFakeSdk(shared, googleUser('uid-1', 'Mahi'));
    const client = await Backend.createClient(config(sdk));
    const { data: { session } } = await client.auth.getSession();
    assert.equal(session.user.id, 'uid-1', 'the game reads user.id');
    assert.equal(session.user.is_anonymous, false);
    assert.deepEqual(session.user.identities, [{ provider: 'google' }]);
    assert.equal(session.user.displayName, 'Mahi');
    assert.equal(good(await client.rpc('has_linked_identity')), true);
});

test('a guest is a guest, and Google sign-in in the popup switches to the Google account', async () => {
    const shared = createFakeFirestore();
    const sdk = createFakeSdk(shared, null);
    const client = await Backend.createClient(config(sdk));
    assert.equal((await client.auth.getSession()).data.session, null);
    const guest = await client.auth.signInAnonymously();
    assert.equal(guest.data.session.user.is_anonymous, true);
    assert.equal(good(await client.rpc('has_linked_identity')), false);
    sdk.nextGoogleUser = googleUser('uid-google', 'Mahi');
    const result = await client.auth.signInWithOAuth({ provider: 'google' });
    assert.equal(result.error, null);
    assert.equal(result.data.session.user.id, 'uid-google');
    assert.equal(result.data.session.user.is_anonymous, false);
});

test('a guest who signs in with Google keeps the same account when that Google account is new', async () => {
    const shared = createFakeFirestore();
    const guest = { uid: 'guest-1', isAnonymous: true, providerData: [], displayName: null, getIdToken: async () => 'token' };
    guest.linkWithPopup = async () => { guest.isAnonymous = false; guest.providerData = [{ providerId: 'google.com', displayName: 'Mahi', email: 'mahi@example.test' }]; return { user: guest }; };
    const client = await Backend.createClient(config(createFakeSdk(shared, guest)));
    const result = await client.auth.signInWithOAuth({ provider: 'google' });
    assert.equal(result.error, null);
    assert.equal(result.data.upgraded, true);
    assert.equal(result.data.session.user.id, 'guest-1', 'saves, hero names and the profile stay with the player');
    assert.equal(result.data.session.user.is_anonymous, false);
    assert.equal(result.data.session.user.displayName, 'Mahi');
    assert.equal(result.data.session.user.email, 'mahi@example.test');
});

test('a guest whose Google account already has a game account is switched to that account', async () => {
    const shared = createFakeFirestore();
    const guest = { uid: 'guest-2', isAnonymous: true, providerData: [], displayName: null, getIdToken: async () => 'token' };
    guest.linkWithPopup = async () => { throw Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { token: 'x' } }); };
    const sdk = createFakeSdk(shared, guest);
    sdk.nextGoogleUser = googleUser('old-account', 'Mahi');
    const client = await Backend.createClient(config(sdk));
    const result = await client.auth.signInWithOAuth({ provider: 'google' });
    assert.equal(result.error, null);
    assert.equal(result.data.session.user.id, 'old-account');
    // Closing the popup is not an error and changes nothing.
    const closing = { uid: 'guest-3', isAnonymous: true, providerData: [], linkWithPopup: async () => { throw Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }); } };
    const closed = await (await Backend.createClient(config(createFakeSdk(shared, closing)))).auth.signInWithOAuth({ provider: 'google' });
    assert.equal(closed.error, null);
    assert.equal(closed.data.session, null);
});

test('the profile is created on first use and the Player ID stays out of the public profile', async () => {
    const { shared, asha, ravi } = await world();
    assert.match(asha.profile.player_code, /^KND-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(asha.profile.display_name, 'Asha');
    assert.equal(shared.store.get('profiles/asha').player_code, undefined, 'the login secret is not in the public profile');
    assert.equal(shared.store.get('accounts/asha').player_code, asha.profile.player_code);
    good(await asha.client.from('profiles').update({ display_name: 'Asha the Bold', level: 7, last_seen: new Date().toISOString() }).eq('id', 'asha'));
    const seen = good(await ravi.client.from('profiles').select('id,display_name,level').eq('id', 'asha').maybeSingle());
    assert.equal(seen.display_name, 'Asha the Bold');
    assert.equal(seen.player_code, undefined);
    assert.equal(good(await asha.client.rpc('get_my_profile')).player_code, asha.profile.player_code, 'the code does not change');
});

test('cloud save: a large roster with nested lists is written and read back unchanged', async () => {
    const { asha, ravi } = await world();
    const roster = { version: 2, activeHeroId: 'h1', heroes: { h1: { player: { name: 'Asha', level: 12 }, grid: [[1, 2], [3, [4, 5]]], log: 'x'.repeat(600000), telugu: 'నమస్కారం' } } };
    good(await asha.client.from('game_saves').upsert({ user_id: 'asha', save_data: roster, updated_at: '2026-11-15T10:00:00.000Z' }, { onConflict: 'user_id' }));
    const loaded = good(await asha.client.from('game_saves').select('save_data,updated_at').eq('user_id', 'asha').maybeSingle());
    assert.deepEqual(loaded.save_data, roster);
    assert.equal(loaded.updated_at, '2026-11-15T10:00:00.000Z');
    assert.equal(good(await ravi.client.from('game_saves').select('save_data').eq('user_id', 'ravi').maybeSingle()), null, 'no save yet is not an error');
    // A smaller save afterwards must not be mixed with old parts.
    good(await asha.client.from('game_saves').upsert({ user_id: 'asha', save_data: { version: 2, activeHeroId: null, heroes: {} }, updated_at: 'later' }));
    assert.deepEqual(good(await asha.client.from('game_saves').select('save_data').eq('user_id', 'asha').maybeSingle()).save_data, { version: 2, activeHeroId: null, heroes: {} });
});

test('hero names are unique across players', async () => {
    const { asha, ravi } = await world();
    assert.equal(good(await asha.client.rpc('hero_name_available', { desired_name: 'Black Knight', current_slot: 'h1' })), true);
    good(await asha.client.rpc('reserve_hero_name', { desired_name: 'Black Knight', target_slot: 'h1' }));
    assert.equal(good(await ravi.client.rpc('hero_name_available', { desired_name: '  black   KNIGHT ' })), false);
    assert.equal(good(await asha.client.rpc('hero_name_available', { desired_name: 'Black Knight' })), true, 'the owner may keep the name');
    const taken = await ravi.client.rpc('reserve_hero_name', { desired_name: 'black knight', target_slot: 'h9' });
    assert.match(taken.error.message, /already taken/);
    // Renaming frees the old name.
    good(await asha.client.rpc('reserve_hero_name', { desired_name: 'White Knight', target_slot: 'h1' }));
    assert.equal(good(await ravi.client.rpc('hero_name_available', { desired_name: 'Black Knight' })), true);
    good(await asha.client.rpc('release_hero_name', { target_slot: 'h1' }));
    assert.equal(good(await ravi.client.rpc('hero_name_available', { desired_name: 'White Knight' })), true);
    assert.equal(good(await ravi.client.rpc('hero_name_available', { desired_name: 'a/b.c' })), true, 'odd characters do not break the lookup');
});

test('friend requests: find a hero, send, list on both sides, accept, live update', async () => {
    const { asha, ravi } = await world();
    const found = good(await asha.client.rpc('find_heroes_by_name', { hero_name: 'ravi' }));
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'ravi');
    let pings = 0;
    const live = ravi.client.channel('social').on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => pings++).subscribe();
    await tick();
    good(await asha.client.from('friend_requests').insert({ sender_id: 'asha', receiver_id: 'ravi' }));
    await tick();
    assert.ok(pings >= 1, 'the receiver hears about the request without refreshing');
    const twice = await asha.client.from('friend_requests').insert({ sender_id: 'asha', receiver_id: 'ravi' });
    assert.match(twice.error.message, /already sent/);
    const columns = 'id,status,sender_id,receiver_id,created_at,sender:profiles!friend_requests_sender_id_fkey(display_name),receiver:profiles!friend_requests_receiver_id_fkey(display_name)';
    const inbox = good(await ravi.client.from('friend_requests').select(columns).order('created_at', { ascending: false }).limit(50));
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].status, 'pending');
    assert.equal(inbox[0].sender.display_name, 'Asha');
    assert.equal(inbox[0].receiver.display_name, 'Ravi');
    good(await ravi.client.from('friend_requests').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', inbox[0].id).eq('receiver_id', 'ravi'));
    const sent = good(await asha.client.from('friend_requests').select(columns).order('created_at', { ascending: false }).limit(50));
    assert.equal(sent[0].status, 'accepted');
    assert.match((await asha.client.from('friend_requests').insert({ sender_id: 'asha', receiver_id: 'ravi' })).error.message, /already friends/);
    ravi.client.removeChannel(live);
});

test('chat: public and private messages, live delivery, five-minute lifetime', async () => {
    const { shared, join, asha, ravi } = await world();
    const meera = await join('meera', 'Meera');
    const heard = [];
    const live = ravi.client.channel('social').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => heard.push(payload)).subscribe();
    await tick();
    good(await asha.client.from('messages').insert({ sender_id: 'asha', receiver_id: null, body: 'Hello world', voice_id: 'system:default', source_language: 'te' }));
    good(await asha.client.from('messages').insert({ sender_id: 'asha', receiver_id: 'ravi', body: 'Secret for Ravi', voice_id: 'system:default', source_language: 'en' }));
    await tick();
    assert.deepEqual(heard.filter(p => p.eventType === 'INSERT').map(p => p.new.body).sort(), ['Hello world', 'Secret for Ravi']);
    assert.equal(heard[0].new.receiver_id, null);
    const list = c => c.from('messages').select('*,sender:profiles!messages_sender_id_fkey(display_name)').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30);
    const forRavi = good(await list(ravi.client));
    assert.deepEqual(forRavi.map(m => m.body).sort(), ['Hello world', 'Secret for Ravi']);
    assert.equal(forRavi[0].sender.display_name, 'Asha');
    assert.equal(forRavi.find(m => m.body === 'Hello world').source_language, 'te');
    assert.ok(Date.parse(forRavi[0].expires_at) - Date.parse(forRavi[0].created_at) === 300000);
    assert.deepEqual(good(await list(meera.client)).map(m => m.body), ['Hello world'], 'a third player never sees the private message');
    assert.equal(good(await list(asha.client)).length, 2, 'the sender sees both');
    assert.match((await asha.client.from('messages').insert({ sender_id: 'asha', receiver_id: null, body: '' })).error.message, /1 and 300/);
    assert.ok((await asha.client.from('messages').insert({ sender_id: 'ravi', receiver_id: null, body: 'forged' })).error, 'nobody can write as another player');
    // Six minutes later nothing is shown any more.
    for (const [path, data] of shared.store) if (/messages\//.test(path)) data.created_at.ms -= 6 * 60000;
    assert.equal(good(await list(ravi.client)).length, 0);
    ravi.client.removeChannel(live);
});

test('feedback: a player sends it, a moderator reads and answers it', async () => {
    const { asha, ravi } = await world();
    const id = good(await asha.client.rpc('submit_game_feedback', { feedback_category: 'bug', feedback_message: 'The bridge is silent.' }));
    assert.ok(id);
    assert.match((await asha.client.rpc('submit_game_feedback', { feedback_category: 'bug', feedback_message: 'x' })).error.message, /3 and 2000/);
    const inbox = good(await ravi.client.rpc('list_moderator_feedback', { row_limit: 50 }));
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].feedback_id, id);
    assert.equal(inbox[0].message, 'The bridge is silent.');
    assert.equal(inbox[0].category, 'bug');
    assert.equal(inbox[0].status, 'new');
    good(await ravi.client.rpc('moderate_game_feedback', { feedback_id: id, new_status: 'resolved', private_note: 'Fixed in 7.57' }));
    assert.equal(good(await ravi.client.rpc('list_moderator_feedback', {}))[0].status, 'resolved');
});

test('combat group: create, invite, accept, and attacks reach the other member live', async () => {
    const { asha, ravi } = await world();
    const hits = [];
    // Ravi subscribes BEFORE he belongs to any group, as the game does at sign-in.
    const live = ravi.client.channel('social').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_battle_actions' }, payload => hits.push(payload.new)).subscribe();
    const group = good(await asha.client.from('combat_groups').insert({ name: 'Dawn Raiders', owner_id: 'asha' }).select('*').single());
    assert.ok(group.id);
    assert.equal(group.name, 'Dawn Raiders');
    good(await asha.client.from('combat_group_members').insert({ group_id: group.id, user_id: 'asha', role: 'leader' }));
    assert.equal(good(await asha.client.from('combat_group_members').select('group_id').eq('user_id', 'asha').eq('role', 'leader').limit(1).maybeSingle()).group_id, group.id);
    good(await asha.client.from('combat_group_invites').insert({ group_id: group.id, sender_id: 'asha', receiver_id: 'ravi' }));
    const invites = good(await ravi.client.from('combat_group_invites').select('id,status,group:combat_groups(id,name),sender:profiles!combat_group_invites_sender_id_fkey(display_name)').eq('receiver_id', 'ravi').eq('status', 'pending'));
    assert.equal(invites.length, 1);
    assert.equal(invites[0].group.name, 'Dawn Raiders');
    assert.equal(invites[0].sender.display_name, 'Asha');
    const invite = good(await ravi.client.from('combat_group_invites').select('id,group_id').eq('id', invites[0].id).eq('receiver_id', 'ravi').single());
    good(await ravi.client.from('combat_group_invites').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', invite.id));
    good(await ravi.client.from('combat_group_members').insert({ group_id: invite.group_id, user_id: 'ravi', role: 'member' }));
    assert.equal(good(await ravi.client.from('combat_group_invites').select('id').eq('receiver_id', 'ravi').eq('status', 'pending')).length, 0);
    await tick(20);
    good(await asha.client.from('group_battle_actions').insert({ group_id: group.id, user_id: 'asha', monster_name: 'Cave Troll', damage: 42 }));
    await tick(20);
    assert.equal(hits.length, 1, 'the new member hears the attack');
    assert.equal(hits[0].damage, 42);
    assert.equal(hits[0].monster_name, 'Cave Troll');
    assert.equal(hits[0].group_id, group.id);
    ravi.client.removeChannel(live);
});

test('guild (brotherhood): create, unique name, invite, join, list', async () => {
    const { asha, ravi } = await world();
    const guild = good(await asha.client.from('guilds').insert({ name: 'Iron Oath', owner_id: 'asha' }).select('id,name,owner_id,rupees').single());
    assert.equal(guild.rupees, 0);
    good(await asha.client.from('guild_members').insert({ guild_id: guild.id, user_id: 'asha', role: 'owner' }));
    assert.match((await ravi.client.from('guilds').insert({ name: 'iron  oath', owner_id: 'ravi' }).select('id').single()).error.message, /already taken/);
    const mine = good(await asha.client.from('guild_members').select('role,guild:guilds(id,name,owner_id,rupees)').eq('user_id', 'asha').limit(1).maybeSingle());
    assert.equal(mine.role, 'owner');
    assert.equal(mine.guild.name, 'Iron Oath');
    good(await asha.client.from('guild_invites').insert({ guild_id: guild.id, sender_id: 'asha', receiver_id: 'ravi' }));
    const invites = good(await ravi.client.from('guild_invites').select('id,status,guild:guilds(id,name),sender:profiles!guild_invites_sender_id_fkey(display_name)').eq('receiver_id', 'ravi').eq('status', 'pending'));
    assert.equal(invites[0].guild.name, 'Iron Oath');
    good(await ravi.client.from('guild_invites').update({ status: 'accepted' }).eq('id', invites[0].id));
    good(await ravi.client.from('guild_members').insert({ guild_id: guild.id, user_id: 'ravi', role: 'member' }));
    assert.equal(good(await ravi.client.from('guild_members').select('role,joined_at,guild:guilds(id,name,owner_id,rupees)').eq('user_id', 'ravi')).length, 1);
    assert.equal(good(await ravi.client.from('guild_members').select('role').eq('user_id', 'nobody').limit(1).maybeSingle()), null);
});

test('chat rooms: default rooms, a private room, invite, join, talk, block', async () => {
    const { shared, asha, ravi } = await world();
    const personal = good(await asha.client.rpc('ensure_personal_chat_room'));
    const rooms = good(await asha.client.from('chat_rooms').select('*,owner:profiles!chat_rooms_owner_id_fkey(display_name)').order('created_at', { ascending: true }));
    assert.deepEqual(rooms.filter(room => room.visibility === 'public').map(room => room.id).sort(), ['french', 'help', 'trade', 'world']);
    assert.equal(rooms.find(room => room.id === 'french').language, 'fr-FR');
    assert.ok(rooms.some(room => room.id === personal && room.owner.display_name === 'Asha'));
    const roomId = good(await asha.client.rpc('create_custom_chat_room', { room_name: 'Night Watch', room_visibility: 'private', max_users: 5, wait_minutes: 0 }));
    assert.ok(!good(await ravi.client.from('chat_rooms').select('*').order('created_at')).some(room => room.id === roomId), 'a private room is not listed for strangers');
    good(await asha.client.from('chat_room_invites').insert({ room_id: roomId, sender_id: 'asha', receiver_id: 'ravi' }));
    const invites = good(await ravi.client.from('chat_room_invites').select('id,status,room:chat_rooms(id,name,visibility),sender:profiles!chat_room_invites_sender_id_fkey(display_name)').eq('receiver_id', 'ravi').eq('status', 'pending'));
    assert.equal(invites[0].room.name, 'Night Watch');
    good(await ravi.client.from('chat_room_invites').update({ status: 'accepted' }).eq('id', invites[0].id).eq('receiver_id', 'ravi'));
    assert.ok(good(await ravi.client.from('chat_rooms').select('*').order('created_at')).some(room => room.id === roomId), 'the invited player now sees the room');
    assert.equal(good(await ravi.client.from('chat_rooms').select('*').eq('id', roomId).single()).name, 'Night Watch');
    good(await asha.client.rpc('join_chat_room', { target_room: roomId }));
    good(await ravi.client.rpc('join_chat_room', { target_room: roomId }));
    const beat = good(await ravi.client.rpc('chat_room_heartbeat', { target_room: roomId }));
    assert.equal(beat.users, 2);
    assert.equal(beat.activated, true);
    const heard = [];
    const live = ravi.client.channel(`room-${roomId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'chat_room_messages', filter: `room_id=eq.${roomId}` }, payload => heard.push(payload)).subscribe();
    await tick();
    good(await asha.client.from('chat_room_messages').insert({ room_id: roomId, sender_id: 'asha', body: 'Who goes there?', voice_id: 'system:default', source_language: 'en' }));
    await tick();
    assert.equal(heard.length, 1);
    assert.equal(heard[0].eventType, 'INSERT');
    assert.equal(heard[0].new.body, 'Who goes there?');
    const lines = good(await ravi.client.from('chat_room_messages').select('*,sender:profiles!chat_room_messages_sender_id_fkey(display_name)').eq('room_id', roomId).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].sender.display_name, 'Asha');
    // Old lines are hidden after five minutes and later removed from the database.
    for (const [path, data] of shared.store) if (path.startsWith(`chat_rooms/${roomId}/messages/`)) data.created_at.ms -= 6 * 60000;
    const readRoom = () => ravi.client.from('chat_room_messages').select('*').eq('room_id', roomId).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50);
    assert.equal(good(await readRoom()).length, 0);
    good(await asha.client.from('chat_room_messages').insert({ room_id: 'world', sender_id: 'asha', body: 'old news' }));
    for (const [path, data] of shared.store) if (path.startsWith('chat_rooms/world/messages/')) data.created_at.ms -= 6 * 60000;
    assert.equal(good(await ravi.client.from('chat_room_messages').select('*').eq('room_id', 'world').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50)).length, 0);
    await tick(20);
    assert.ok(![...shared.store.keys()].some(path => path.startsWith('chat_rooms/world/messages/')), 'expired lines are deleted');
    good(await asha.client.rpc('blacklist_chat_user', { target_room: roomId, target_user: 'ravi', block_reason: 'test' }));
    assert.match((await ravi.client.rpc('join_chat_room', { target_room: roomId })).error.message, /blocked/);
    ravi.client.removeChannel(live);
    good(await asha.client.from('chat_rooms').delete().eq('id', roomId).eq('owner_id', 'asha'));
    assert.ok((await asha.client.from('chat_rooms').select('*').eq('id', roomId).single()).error, 'the room is gone');
});

test('loot left on the ground can be taken by exactly one player', async () => {
    const { asha, ravi } = await world();
    good(await asha.client.from('world_drops').insert({ location_id: 'forest_gate', dropped_by: 'asha', item_id: 'iron_sword', item_snapshot: { id: 'iron_sword', name: 'Iron Sword', stats: { atk: [3, 5] } }, quantity: 1 }));
    const seen = good(await ravi.client.from('world_drops').select('id,item_id,item_snapshot,quantity,created_at').eq('location_id', 'forest_gate').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(100));
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].item_snapshot, { id: 'iron_sword', name: 'Iron Sword', stats: { atk: [3, 5] } });
    assert.equal(good(await ravi.client.from('world_drops').select('id').eq('location_id', 'elsewhere').gt('expires_at', new Date().toISOString())).length, 0);
    const taken = good(await ravi.client.rpc('take_world_drop', { drop_uuid: seen[0].id }));
    assert.equal(taken.item_id, 'iron_sword');
    assert.equal(taken.item_snapshot.name, 'Iron Sword');
    assert.match((await asha.client.rpc('take_world_drop', { drop_uuid: seen[0].id })).error.message, /already took/);
});

test('Player ID and PIN: the save can be restored on another device, a wrong PIN finds nothing', async () => {
    const { shared, join, asha } = await world();
    const roster = { version: 2, activeHeroId: 'h1', heroes: { h1: { player: { name: 'Asha', level: 3 } } } };
    good(await asha.client.rpc('set_player_recovery_pin', { new_pin: '482913', current_save: roster }));
    assert.match((await asha.client.rpc('set_player_recovery_pin', { new_pin: '12', current_save: roster })).error.message, /6 digits/);
    const other = await join('new-device', 'Guest');
    assert.deepEqual(good(await other.client.rpc('recover_progress_with_pin', { code: asha.profile.player_code.toLowerCase(), supplied_pin: '482913' })), roster);
    assert.match((await other.client.rpc('recover_progress_with_pin', { code: asha.profile.player_code, supplied_pin: '000000' })).error.message, /Invalid Player ID or PIN/);
    assert.ok(![...shared.store.keys()].some(path => path.includes('482913')), 'the PIN is never stored');
    // A new PIN replaces the old copy.
    good(await asha.client.rpc('set_player_recovery_pin', { new_pin: '777777', current_save: roster }));
    assert.ok((await other.client.rpc('recover_progress_with_pin', { code: asha.profile.player_code, supplied_pin: '482913' })).error);
    assert.deepEqual(good(await other.client.rpc('recover_progress_with_pin', { code: asha.profile.player_code, supplied_pin: '777777' })), roster);
});

test('who is online, name suggestions and community map notes', async () => {
    const { asha, ravi } = await world();
    good(await asha.client.from('profiles').update({ display_name: 'Asha', level: 4, current_location: 'Kaliwasch City', last_seen: new Date().toISOString() }).eq('id', 'asha'));
    good(await ravi.client.from('profiles').update({ display_name: 'Ravi', level: 2, last_seen: new Date(Date.now() - 3600000).toISOString() }).eq('id', 'ravi'));
    const since = new Date(Date.now() - 600000).toISOString();
    const online = good(await ravi.client.from('profiles').select('display_name,level,current_location,last_seen').gte('last_seen', since).order('last_seen', { ascending: false }).limit(30));
    assert.deepEqual(online.map(hero => hero.display_name), ['Asha']);
    const suggestions = good(await ravi.client.from('profiles').select('id,display_name,level,current_location,last_seen').ilike('display_name', '%as%').neq('id', 'ravi').order('last_seen', { ascending: false }).limit(8));
    assert.deepEqual(suggestions.map(hero => hero.display_name), ['Asha']);
    good(await asha.client.from('community_map_markers').insert({ creator_id: 'asha', location_id: 'forest_gate', title: 'Hidden path', note: 'Go north twice.', visibility: 'public' }));
    const markers = good(await ravi.client.from('community_map_markers').select('id,title,note,location_id,creator_id,creator:profiles!community_map_markers_creator_id_fkey(display_name)').eq('location_id', 'forest_gate').order('created_at', { ascending: false }).limit(30));
    assert.equal(markers[0].creator.display_name, 'Asha');
    good(await asha.client.from('community_map_markers').delete().eq('id', markers[0].id).eq('creator_id', 'asha'));
    assert.equal(good(await ravi.client.from('community_map_markers').select('id').eq('location_id', 'forest_gate')).length, 0);
});

test('features that need server code answer clearly instead of failing silently', async () => {
    const { asha } = await world();
    assert.match((await asha.client.rpc('create_trade_offer', { target_hero: 'Ravi' })).error.message, /not available in this version/);
    assert.deepEqual(good(await asha.client.from('game_hall_invites').select('id').eq('receiver_id', 'asha').eq('status', 'pending')), []);
    assert.match((await asha.client.rpc('no_such_function')).error.message, /function no_such_function/);
});

test('the page loads the Firebase database and no longer loads the old backends', () => {
    const html = readFileSync('index.html', 'utf8');
    assert.ok(html.includes('firebase-firestore-compat.js'));
    assert.ok(html.includes('src="firebase-backend.js"'));
    assert.ok(html.indexOf('firebase-backend.js') < html.indexOf('backend-config.js'));
    assert.doesNotMatch(html, /neon|supabase/i);
    const settings = readFileSync('backend-config.js', 'utf8');
    assert.doesNotMatch(settings, /neon\.tech|supabase\.co/);
    const rules = readFileSync('firestore.rules', 'utf8');
    for (const name of ['profiles', 'accounts', 'hero_names', 'game_saves', 'player_recovery', 'friend_requests', 'public_messages', 'inbox', 'game_feedback', 'guilds', 'guild_members', 'guild_invites', 'combat_groups', 'combat_group_members', 'combat_group_invites', 'world_drops', 'community_map_markers', 'chat_rooms', 'chat_room_invites']) {
        assert.ok(rules.includes(`match /${name}/`), `firestore.rules has no section for ${name}`);
    }
    let depth = 0;
    for (const char of rules.replace(/\/\/.*$/gm, '').replace(/'[^']*'/g, "''")) { if (char === '{') depth++; if (char === '}') depth--; assert.ok(depth >= 0); }
    assert.equal(depth, 0, 'firestore.rules braces are balanced');
});
