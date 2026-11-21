import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

test('standalone practice supports a detour, one turn-in and restart', async t => {
    const dom = new JSDOM(await readFile(new URL('../palace-practice.html', import.meta.url),'utf8'), {runScripts:'dangerously'});
    t.after(() => dom.window.close());
    const d = dom.window.document;
    const click = name => [...d.querySelectorAll('button')].find(b => b.textContent === name).click();
    click('Read quest directions');
    assert.match(d.querySelector('#message').textContent,/west/);
    click('west to Royal Palace entrance'); click('west to Royal Palace Library'); click('Read quest directions');
    assert.match(d.querySelector('#message').textContent,/east/);
    click('east to Royal Palace entrance'); click('Report victory');
    assert.match(d.querySelector('#message').textContent,/250 experience/);
    assert.doesNotMatch(d.querySelector('#actions').textContent,/Report victory/);
    click('Restart court practice'); assert.match(d.querySelector('#place').textContent,/Armory/);
});

test('full rehearsal gates travel on the wounded target and can be replayed', async t => {
    const dom = new JSDOM(await readFile(new URL('../palace-practice.html', import.meta.url),'utf8'), {runScripts:'dangerously'});
    t.after(() => dom.window.close());
    const d = dom.window.document;
    const click = selector => d.querySelector(selector).click();
    for (let run = 0; run < 2; run++) {
        click('#full');
        assert.equal(d.activeElement.id,'place');
        click('#actions button:first-child');
        assert.match(d.querySelector('#message').textContent,/try again/);
        assert.equal(d.querySelector('#guide').hidden,true);
        click('#actions button:last-child');
        assert.match(d.querySelector('#message').textContent,/not collected yet/);
        assert.equal(d.activeElement.id,'guide');
        click('#guide'); click('#actions button:first-child'); click('#actions button:last-child');
        assert.match(d.querySelector('#message').textContent,/awards 250 experience/);
        assert.doesNotMatch(d.querySelector('#actions').textContent,/Report victory/);
    }
});

test('cue review works without a voice, including before the first instruction', async t => {
    const dom = new JSDOM(await readFile(new URL('../palace-practice.html', import.meta.url),'utf8'), {runScripts:'dangerously'});
    t.after(() => dom.window.close());
    const d = dom.window.document;
    assert.equal(d.querySelector('#speak').hidden,true);
    d.querySelector('#review').click(); assert.equal(d.activeElement.id,'place');
    d.querySelector('#guide').click(); d.querySelector('#review').click();
    assert.equal(d.activeElement.id,'message'); assert.match(d.activeElement.textContent,/west/);
    assert.match(d.querySelector('#place').textContent,/Armory/);
});

test('browser speech is opt-in and repeating the receipt cannot grant another reward', async t => {
    const spoken = [];
    const dom = new JSDOM(await readFile(new URL('../palace-practice.html', import.meta.url),'utf8'), {
        runScripts:'dangerously', beforeParse(w) {
            w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
            w.speechSynthesis = {cancel(){}, speak(u){spoken.push(u);}};
        }
    });
    t.after(() => dom.window.close());
    const d = dom.window.document;
    d.querySelector('#actions button').click(); d.querySelector('#actions button:last-child').click();
    assert.equal(spoken.length,0);
    d.querySelector('#speak').click(); d.querySelector('#speak').click();
    assert.match(spoken[0].text,/awards 250/); assert.equal(spoken[1].text,spoken[0].text);
    assert.doesNotMatch(d.querySelector('#actions').textContent,/Report victory/);
    spoken[1].onerror(); assert.match(d.querySelector('#voice-note').textContent,/Review latest cue/);
});
