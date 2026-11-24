/**
 * 7.67.0 — the game speaks as a world, never as a development project.
 *
 * The owner asked for a complete audit of player-facing text: no development
 * conversation, no explanation of timers, resets or cooldowns, no announced
 * reward amounts, and quests told as stories. This suite guards that promise in
 * two ways: it runs the same audit the release uses (scripts/audit-player-text)
 * and it checks the living strings a player actually hears.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';
import { audit } from '../scripts/audit-player-text.mjs';

const TIMER_TALK = /\b(24[- ]?hours?|cooldowns?|resets?|resets? at|once (a|per|every) (day|hour|24)|refreshes?|timer|expires?|available in \d+|again tomorrow|hours? remaining)\b/i;
const REWARD_TALK = /\b(\d+\s*(xp|exp|experience|gold|rupees?|coins?)|you (earn|receive|gain)|reward\s*:|rewards?\b)\b/i;

test('(01/09) the shipped player text contains no leak and no reward announcement', async () => {
    const result = await audit();
    assert.ok(result.strings > 5000, `the audit really read the game text (${result.strings} strings)`);
    const leaks = result.findings.filter(finding => finding.kind.some(kind => !kind.startsWith('reward:')));
    const rewards = result.findings.filter(finding => finding.kind.every(kind => kind.startsWith('reward:')));
    const show = list => list.slice(0, 6).map(f => `${f.file}:${f.line} [${f.kind}] ${f.text.slice(0, 90)}`).join('\n');
    assert.equal(leaks.length, 0, `no development talk reaches a player:\n${show(leaks)}`);
    assert.equal(rewards.length, 0, `no reward amount is announced:\n${show(rewards)}`);
});

test('(02/09) prayer and blessing text never explains a limit, timer or reset', async () => {
    const source = await readFile('survival-v755.js', 'utf8');
    const keys = ['pray.daily', 'pray.already', 'temple.heal', 'pray.permanentAlready', 'pray.firstOffer', 'pray.choose'];
    for (const key of keys) {
        const line = source.split('\n').find(entry => entry.trim().startsWith(`'${key}':`));
        assert.ok(line, `${key} exists`);
        assert.doesNotMatch(line, TIMER_TALK, `${key} never explains a mechanic: ${line?.slice(0, 160)}`);
    }
    // The blessing is described as a gift, not as an allowance.
    assert.match(source, /A blessing of \{blessing\} settles on you/);
    assert.match(source, /already rests upon you/);
});

test('(03/09) every palace quest is set as a scene, with no counts and no reward', async () => {
    const source = await readFile('survival-v755.js', 'utf8');
    for (const id of ['royal_hunt', 'palace_healers_road', 'palace_border_watch', 'palace_scholars_errand', 'palace_kings_champion']) {
        const line = source.split('\n').find(entry => entry.trim().startsWith(`'quest.desc.${id}':`));
        assert.ok(line, `quest.desc.${id} exists`);
        const english = line.match(/\['([^']*)'/)?.[1] || '';
        assert.ok(english.length > 40, `${id} carries a real description`);
        assert.doesNotMatch(english, /\b(five|eight|twelve|fifteen|twenty|\d+)\b|reward|experience|gold|rupees/i, `${id} is a story, not a quota: ${english}`);
    }
    for (const key of ['quest.accepted', 'quest.completed', 'quest.ready', 'quest.finalVictory', 'quest.previouslyPaid']) {
        const line = source.split('\n').find(entry => entry.trim().startsWith(`'${key}':`));
        assert.ok(line, `${key} exists`);
        assert.doesNotMatch(line, REWARD_TALK, `${key} promises nothing: ${line?.slice(0, 160)}`);
    }
});

test('(04/09) finishing a quest speaks its own closing scene and never an amount', async t => {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    await wait(0);
    const { window } = runtime;
    const { Game, document } = window;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    Game.startNewHero();
    document.getElementById('char-name').value = 'Story Hero';
    document.querySelector('[data-race="human"]').classList.add('selected');
    document.querySelector('[data-class="warrior"]').classList.add('selected');
    Game.createCharacter(false);
    Game.state.storyIntroSeen = true;
    const quest = window.WorldData.quests.find(entry => entry.id === 'first_blood');
    assert.ok(quest?.epilogue, 'the quest carries a closing scene');
    document.getElementById('narrative').replaceChildren();
    const gold = Game.state.player.gold;
    const xp = Game.state.player.xp;
    Game.completeQuest({ ...quest, objectives: [] });
    const log = document.getElementById('narrative').textContent;
    assert.match(log, /The forest goes quiet/, 'the closing scene is told');
    assert.doesNotMatch(log, REWARD_TALK, `no amount is announced: ${log}`);
    assert.ok(Game.state.player.gold > gold, 'the reward is still granted, silently');
    assert.ok(Game.state.player.xp >= xp, 'experience is still granted, silently');
});

test('(05/09) a fallen foe is a scene, not a receipt', async () => {
    const source = await readFile('game.js', 'utf8');
    assert.match(source, /falls before you\.\$\{bonusLoot\}/);
    assert.doesNotMatch(source, /defeated! \+\$\{e\.xp\} XP/);
});

test('(06/09) a character never introduces itself as an AI system', async t => {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    await wait(0);
    const ai = runtime.window.AiNpc;
    assert.ok(ai?.sanitizeReply, 'the reply cleaner exists');
    const cleaned = ai.sanitizeReply('I am a large language model developed by OpenAI and I cannot help with that.');
    assert.doesNotMatch(cleaned, /\b(ai|A\.I\.|language model|openai|nvidia|anthropic)\b/i, `the player hears a person: ${cleaned}`);
    assert.ok(cleaned.length > 0, 'and an answer is still offered');
});

test('(07/09) the help and interface text avoids implementation words', async () => {
    const game = await readFile('game.js', 'utf8');
    const help = game.slice(game.indexOf('showHelp() {'), game.indexOf('showHelp() {') + 9000);
    assert.doesNotMatch(help, /\b(cooldown|finite quest pack|cloud save|command-only|dimension|expanded-world totals)\b/i, 'the help speaks plainly');
    const html = await readFile('index.html', 'utf8');
    assert.doesNotMatch(html, /developer inbox|database administrator|cooldown always prevents/i);
});

test('(08/09) every spoken story line still has its recording', async () => {
    const runtime = await createRuntime();
    try {
        const story = runtime.window.StoryIntro;
        for (const line of [...story.INTRO, ...Object.values(story.QUESTS)]) {
            const info = await import('node:fs/promises').then(fs => fs.stat(`assets/story/${line.cue}.mp3`));
            assert.ok(info.size > 4000, `${line.cue}.mp3 is a real recording`);
            assert.doesNotMatch(line.text, REWARD_TALK, `${line.cue} promises nothing`);
        }
    } finally { runtime.dom.window.close(); }
});

test('(09/09) the audit is part of the release commands', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    assert.match(pkg.scripts['text:audit'] || '', /audit-player-text/);
    assert.match(pkg.scripts.validate || '', /text:audit/);
});
