import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

/** Evaluate the browser's real script order in a non-networked DOM. */
export async function createRuntime(root = process.cwd()) {
    const html = await readFile(new URL(`file://${root}/index.html`), 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://example.test/Black-sold-ultimate/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const window = dom.window;
    window.console = { ...console, log() {}, warn() {}, error: console.error };
    window.alert = () => {};
    window.confirm = () => true;
    window.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) });
    window.caches = { open: async () => ({ add: async () => {}, addAll: async () => {}, put: async () => {} }) };
    window.Audio = class {
        constructor(src = '') { this.src = src; this.dataset = {}; this.paused = true; this.volume = 1; this.currentTime = 0; this.listeners = {}; }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        removeEventListener(type) { delete this.listeners[type]; }
        setAttribute() {} removeAttribute(name) { if (name === 'src') this.src = ''; }
        load() {} pause() { this.paused = true; } play() { this.paused = false; return Promise.resolve(); }
    };
    window.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = {}; }
        createGain() { return { gain: { value: 1 }, connect() {} }; }
        createBufferSource() { return { connect() {}, disconnect() {}, start() {}, addEventListener() {}, buffer: null, playbackRate: { value: 1 } }; }
        decodeAudioData() { return Promise.resolve({ duration: 0.01 }); }
        resume() { return Promise.resolve(); }
    };
    window.speechSynthesis = { getVoices: () => [], addEventListener() {}, cancel() {}, speak(utterance) { queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); }); } };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };

    const scripts = [...window.document.querySelectorAll('script[src]')]
        .map(element => element.getAttribute('src'))
        .filter(source => source && !source.startsWith('http') && !source.startsWith('assets/vendor') && source !== 'game-hall.js' && source !== 'pwa.js' && source !== 'supabase-config.js');
    let bundle = '';
    for (const file of scripts) bundle += `\n// ---- ${file} ----\n${await readFile(new URL(`file://${root}/${file}`), 'utf8')}\n`;
    window.eval(bundle);
    return { window, dom, scripts };
}

/** Return a serializable copy of the finalized WorldData graph used by movement
 * and Wayfinder, then close the DOM so test timers cannot leak. */
export async function loadWorld(root = process.cwd()) {
    const runtime = await createRuntime(root);
    const world = JSON.parse(JSON.stringify(runtime.window.WorldData));
    const graphReport = JSON.parse(JSON.stringify(runtime.window.WorldGraph?.report || {}));
    runtime.dom.window.close();
    return { world, graphReport, scripts: runtime.scripts };
}
