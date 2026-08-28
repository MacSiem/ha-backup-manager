'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cardPath = path.join(__dirname, '..', 'ha-backup-manager.js');
const source = fs.readFileSync(cardPath, 'utf8');

assert.equal(source.includes("document.createElement('script')"), false);
assert.equal(source.includes('window.Chart'), false);
assert.equal(source.includes('/local/community/ha-tools/vendor/chart.umd.min.js'), false);

const registry = new Map();
class FakeHTMLElement {
  constructor() {
    this.tagName = 'HA-BACKUP-MANAGER';
  }

  attachShadow() {
    this.shadowRoot = {
      innerHTML: '',
      querySelectorAll: () => [],
    };
    return this.shadowRoot;
  }

  dispatchEvent() {}
}

const context = vm.createContext({
  HTMLElement: FakeHTMLElement,
  CustomEvent: class CustomEvent {},
  console,
  customElements: {
    define: (name, constructor) => registry.set(name, constructor),
    get: name => registry.get(name),
  },
  document: { createElement: () => ({}) },
  history: { replaceState() {} },
  localStorage: {
    getItem: () => null,
    setItem() {},
  },
  location: { pathname: '/' },
  navigator: { language: 'en-US' },
  setTimeout,
  clearTimeout,
  window: { customCards: [] },
});

vm.runInContext(source, context, { filename: cardPath });

const Card = registry.get('ha-backup-manager');
assert.ok(Card, 'card should register its custom element');

const card = new Card();
card._lang = 'en';
card._healthData.weeklyData = [0, 2, 4, 1];
const html = card._renderFrequencyChart();

assert.match(html, /id="frequency-chart"/);
assert.match(html, /role="img"/);
assert.match(html, /aria-label="Backup count over the last four weeks\. Week 1: 0 backups; Week 2: 2 backups; Week 3: 4 backups; Week 4: 1 backup"/);
assert.equal((html.match(/class="frequency-column"/g) || []).length, 4);
assert.match(html, /Week 1: 0 backups/);
assert.match(html, /Week 2: 2 backups/);
assert.match(html, /Week 3: 4 backups/);
assert.match(html, /Week 4: 1 backup/);
assert.deepEqual(
  [...html.matchAll(/class="frequency-fill" style="height:(\d+)%"/g)].map(match => Number(match[1])),
  [0, 50, 100, 25],
);

card._healthData.weeklyData = [Number.NaN, -3, '2.9', Infinity];
const normalized = card._renderFrequencyChart();
assert.deepEqual(
  [...normalized.matchAll(/class="frequency-value">(\d+)</g)].map(match => Number(match[1])),
  [0, 0, 2, 0],
);

console.log('backup frequency chart smoke: pass');
