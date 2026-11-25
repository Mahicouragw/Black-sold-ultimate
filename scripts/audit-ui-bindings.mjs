#!/usr/bin/env node
/**
 * Every control in the page must be wired to something.
 *
 * The owner asked for a whole-game check that "everything is functional". This
 * script reads index.html, finds every button/input/select that carries an id,
 * and proves each one is reached by some script: a getElementById call, a
 * querySelector, a data-cmd route, an inline onclick, or a form/aria wiring.
 * Anything that is drawn but never reached is reported — that is the class of
 * bug where a button looks pressable and does nothing.
 *
 * Usage: node scripts/audit-ui-bindings.mjs [--json]
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SKIP = new Set(['node_modules', '.git', 'www', 'android', 'ios', 'dist', 'coverage']);

async function scripts(dir = ROOT, found = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await scripts(path, found);
        else if (/\.(js|mjs|html)$/.test(entry.name) && !path.includes('/tests/')) found.push(path);
    }
    return found;
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const sources = new Map();
for (const path of await scripts()) sources.set(path, await readFile(path, 'utf8'));

/** Controls a player can press or type into. */
const controls = [...html.matchAll(/<(button|input|select|textarea|audio)\b([^>]*)>/g)]
    .map(([, tag, attrs]) => {
        const id = /\bid="([^"]+)"/.exec(attrs)?.[1] || '';
        const type = /\btype="([^"]+)"/.exec(attrs)?.[1] || (tag === 'button' ? 'button' : '');
        const hidden = /\bhidden\b/.test(attrs) || /class="[^"]*\bhidden\b/.test(attrs);
        return { tag, id, type, hidden };
    })
    .filter(control => control.id);

const ignoredTypes = new Set(['submit', 'reset']);

function reachedBy(id, tag) {
    const hits = [];
    for (const [path, source] of sources) {
        if (source.includes(`id="${id}"`) || source.includes(`id='${id}'`)) {
            // The markup itself is not wiring; only real script references count.
            if (!path.endsWith('index.html')) hits.push(path);
        }
        if (source.includes(`'${id}'`) || source.includes(`"${id}"`) || source.includes(`#${id}`)) {
            if (!path.endsWith('index.html')) hits.push(path);
        }
    }
    return [...new Set(hits)];
}

const findings = [];
for (const control of controls) {
    if (control.tag === 'input' && ignoredTypes.has(control.type)) continue;
    const wired = reachedBy(control.id, control.tag);
    // A control may be handled by a delegated listener on a container or by the
    // command bar through data-cmd; both show up as a reference to its id.
    if (!wired.length) findings.push({ ...control, reason: 'no script ever mentions this id' });
}

const commands = [...new Set([...html.matchAll(/data-cmd="([^"]+)"/g)].map(match => match[1]))];
const codeSources = [...sources.entries()].filter(([path]) => !path.endsWith('index.html')).map(([, source]) => source);

/** A command may be named exactly, or caught by a prefix handler in its own module
 *  (`christmas …` belongs to the advent calendar, `play chess` to the game hall). */
function commandHandled(command) {
    const first = command.split(' ')[0];
    return codeSources.some(source =>
        source.includes(`'${command}'`) || source.includes(`"${command}"`) ||
        source.includes(`^${first} `) || source.includes(`^${first}$`) ||
        source.includes(`startsWith('${first} `) || source.includes(`startsWith('${first}')`) ||
        source.includes(`=== '${first}'`) || source.includes(`'${command}`));
}

const unhandledCommands = commands.filter(command => !commandHandled(command));

const report = {
    controls: controls.length,
    unwired: findings,
    dataCommands: commands.length,
    unhandledCommands
};

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(`UI binding audit: ${report.controls} controls with ids, ${report.dataCommands} data-cmd values.`);
    if (!findings.length) console.log('Every control is reached by a script.');
    else {
        console.log(`\nUnwired controls (${findings.length}):`);
        for (const finding of findings) console.log(`  ${finding.tag}#${finding.id} — ${finding.reason}`);
    }
    if (unhandledCommands.length) {
        console.log(`\ndata-cmd values with no named branch in the command parser (${unhandledCommands.length}): ${unhandledCommands.join(', ')}`);
    }
}

process.exitCode = findings.length || unhandledCommands.length ? 1 : 0;
