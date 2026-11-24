#!/usr/bin/env node
/**
 * Player-text audit (7.67.0).
 *
 * The game must never show the development conversation, the internal rules or
 * the reward arithmetic to a player. This script reads every shipped gameplay
 * module, pulls out the strings that are actually shown or spoken to the
 * player, and reports two things:
 *
 *   LEAK   — a phrase that must never reach a player (cooldowns, reset times,
 *            "the developer", "AI", version numbers, technical prose).
 *   REWARD — text inside a quest, blessing or notification that announces an
 *            amount of coin, XP or experience instead of telling the story.
 *
 * Usage:
 *   node scripts/audit-player-text.mjs            human summary
 *   node scripts/audit-player-text.mjs --json     machine readable
 *   node scripts/audit-player-text.mjs --strict   exit 1 on any finding
 *
 * The audit is also a test: tests/player-text-audit-v767.test.mjs fails when a
 * LEAK appears in a shipped module, so the cleanup cannot silently regress.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'www', 'dist', 'android', 'ios', 'assets', 'reports', 'tests', '.git']);

/** Calls whose arguments reach the player as narration, speech or on-screen text. */
const PLAYER_CALLS = [
    'addNarrative', 'emitGameEvent', 'say', 'speak', 'narrate', 'announce', 'tell',
    'showToast', 'showNotice', 'notify', 'addMessage', 'describe', 'describeSpellMastery'
];

/** Anything that must never be said to a player. */
const LEAK_RULES = [
    { name: 'cooldown', pattern: /\b(cooldowns?|cool-down)\b/i },
    { name: 'daily-limit', pattern: /\b24[- ]?hours?\b|\bonce (a|per|every) (day|24 hours?|24h)\b|\bonly once\b/i },
    { name: 'reset-schedule', pattern: /\bresets?\b|\breset (at|after|every|daily|in)\b|\brefresh(es|ed)? (at|every|after)\b|\brecharges? (after|in)\b/i },
    { name: 'developer', pattern: /\b(developers?|dev team|chatgpt|as an ai|language model|\bprompt\b(?!\s*:)|llm|gpt)\b/i },
    { name: 'ai', pattern: /\bAI\b|\bA\.I\./ },
    { name: 'implementation', pattern: /\b(implementation|internals?|internal (rule|system|timer)|backend|server-side|front-?end|physical(ly)?)\b/i },
    { name: 'credits', pattern: /\b(AUDIO_CREDITS|OpenGameArt|CC0|CC-BY|licen[cs]e[sd]?|public domain)\b/i },
    { name: 'conversation', pattern: /\b(you asked|as requested|as discussed|we discussed|your request|i (added|changed|implemented|fixed|tested)|the (user|player) asked)\b/i },
    { name: 'version', pattern: /\bv\d+\.\d+(\.\d+)?\b|\bversion \d|\bchangelog\b|\bpatch notes\b|\bbug ?fix\b/i },
    { name: 'test-talk', pattern: /\b(unit tests?|regression tests?|test suite|automated tests?)\b/i }
];

/** Exact amounts that belong in the reward code, never in the story. */
const REWARD_RULES = [
    { name: 'xp-amount', pattern: /\b\d+\s*(xp|exp\b|experience points?)\b/i },
    { name: 'gold-amount', pattern: /\b\d+\s*(gold|coins?|rupees?)\b/i },
    { name: 'grant-verb', pattern: /\b(you (earn|earned|receive|received|gain|gained|get|got)|will receive|reward\s*:|rewards? (of|:))\b/i }
];

/**
 * Prices and costs are fair to show ("a room costs 10 rupees"); a reward is not.
 * Those phrases are removed before the reward rules run.
 */
const PRICE_PATTERN = /\b(?:for|costs?|cost|pay|pays|price|price of|worth|have|hold|own|spend|collect|carry)\s+(?:\d+|a few|some)\s*(?:gold|coins?|rupees?|silver)/gi;

/** A bare translation key is not text the player reads. */
const isKey = text => /^[a-z][a-z0-9_.\-]*$/i.test(text) && /[._]/.test(text);

const files = async dir => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
            out.push(...await files(path.join(dir, entry.name)));
        } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
};

/** Pull the string literals out of a call's arguments, including template text. */
function literals(text) {
    const found = [];
    const push = value => {
        const clean = value.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean) found.push(clean);
    };
    // Single and double quoted strings.
    for (const match of text.matchAll(/(['"])((?:(?!\1)[^\\]|\\.){2,400})\1/g)) push(match[2]);
    // Template literals: keep the words, drop the ${...} expressions.
    for (const match of text.matchAll(/`((?:[^`\\]|\\.){2,600})`/g)) push(match[1].replace(/\$\{[^}]*\}/g, ' '));
    return found;
}

/** Collect the argument text of the next call after `index` (balanced parentheses). */
function callArguments(source, index) {
    const start = source.indexOf('(', index);
    if (start === -1) return '';
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0) return source.slice(start + 1, i);
        } else if (ch === '\n' && depth === 1) {
            // A statement usually ends on its own line; do not swallow a file.
            if (i - start > 900) break;
        }
    }
    return source.slice(start + 1, start + 600);
}

const CALL_PATTERN = new RegExp(`\\b(${PLAYER_CALLS.join('|')})\\s*\\(`, 'g');

/**
 * World data and quest data are not passed to a function: they are written as
 * properties and shown later by the location, quest and item screens. They are
 * read here with the same rules.
 */
const PROP_PATTERN = /\b(description|desc|epilogue|hint|warning|title|dialogue|greeting|response|reply)\s*:\s*(['"`])/g;

export async function audit({ dir = ROOT } = {}) {
    const list = await files(dir);
    const findings = [];
    let scannedStrings = 0;
    for (const file of list) {
        const source = await readFile(file, 'utf8');
        const lines = source.split('\n');
        const candidates = [];
        for (const match of source.matchAll(CALL_PATTERN)) {
            candidates.push({ call: match[1], index: match.index, args: callArguments(source, match.index + match[0].length) });
        }
        for (const match of source.matchAll(/\b(?:textContent|innerHTML)\s*=\s*(['"`])/g)) {
            candidates.push({ call: 'markup', index: match.index, args: source.slice(match.index, match.index + 800), leakOnly: true });
        }
        for (const match of source.matchAll(PROP_PATTERN)) {
            candidates.push({ call: 'property', index: match.index, args: source.slice(match.index + match[0].length - 1, match.index + 700) });
        }
        for (const candidate of candidates) {
            const match = { index: candidate.index };
            const line = source.slice(0, match.index).split('\n').length;
            const args = candidate.args;
            for (const text of literals(args)) {
                scannedStrings++;
                if (isKey(text)) continue;
                const hits = [];
                for (const rule of LEAK_RULES) if (rule.pattern.test(text)) hits.push(rule.name);
                const priced = text.replace(PRICE_PATTERN, ' ');
                if (!candidate.leakOnly) for (const rule of REWARD_RULES) if (rule.pattern.test(priced)) hits.push(`reward:${rule.name}`);
                if (!hits.length) continue;
                findings.push({
                    file: path.relative(dir, file),
                    line,
                    call: candidate.call,
                    kind: hits,
                    text: text.slice(0, 240),
                    context: lines[line - 1]?.trim().slice(0, 240) || ''
                });
            }
        }
    }
    return { scanned: list.length, strings: scannedStrings, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await audit();
    const leaks = result.findings.filter(f => f.kind.some(k => !k.startsWith('reward:')));
    const rewards = result.findings.filter(f => f.kind.every(k => k.startsWith('reward:')));
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify({ ...result, leaks: leaks.length, rewards: rewards.length, items: result.findings }, null, 2));
    } else {
        const byRule = {};
        for (const finding of result.findings) for (const kind of finding.kind) byRule[kind] = (byRule[kind] || 0) + 1;
        console.log(`Player text audit: ${result.scanned} modules, ${result.strings} player-facing strings.`);
        console.log(`Leaks: ${leaks.length}. Reward announcements: ${rewards.length}.`);
        console.log('By rule:', JSON.stringify(byRule, null, 1));
        for (const finding of [...leaks, ...rewards].slice(0, 60)) {
            console.log(`\n${finding.file}:${finding.line}  [${finding.kind.join(', ')}]  ${finding.call}`);
            console.log(`  ${finding.text}`);
        }
        if (leaks.length + rewards.length > 60) console.log(`\n… ${leaks.length + rewards.length - 60} more (use --json).`);
    }
    await mkdir(path.join(ROOT, 'reports'), { recursive: true });
    await writeFile(path.join(ROOT, 'reports', 'player-text-audit.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        modules: result.scanned,
        strings: result.strings,
        leaks: leaks.length,
        rewards: rewards.length,
        items: result.findings
    }, null, 2) + '\n');
    if (process.argv.includes('--strict') && (leaks.length || rewards.length)) process.exit(1);
}
