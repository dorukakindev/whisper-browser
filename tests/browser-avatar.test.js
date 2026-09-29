'use strict';
// R238: browserTabAvatar harfi/tonu kayıtlı alan adından gelmeli — tr.wikipedia.org → "W",
// sub.bbc.co.uk → "B"; www öneki ve IP/localhost davranışı korunur.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RENDERER = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');

function makeAvatarHarness() {
  const src = RENDERER.slice(
    RENDERER.indexOf('const BROWSER_AVATAR_SECOND_LEVEL_TLDS'),
    RENDERER.indexOf('function browserCloseIcon'),
  );
  const document = {
    createElement(tag) {
      const classes = new Set();
      const el = {
        tagName: tag.toUpperCase(),
        textContent: '',
        classList: {
          add: (...names) => names.forEach((n) => classes.add(n)),
          contains: (n) => classes.has(n),
        },
        style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
      };
      return el;
    },
  };
  const ctx = vm.createContext({ document, URL, Array, String, Set, Math });
  vm.runInContext(`${src}; globalThis.__avatar = browserTabAvatar; globalThis.__key = browserAvatarDomainKey;`, ctx);
  return ctx;
}

test('avatar: alt alan adında harf kayıtlı domainden gelir', () => {
  const { __avatar, __key } = makeAvatarHarness();
  assert.equal(__avatar({ url: 'https://tr.wikipedia.org/wiki/X' }).textContent, 'W');
  assert.equal(__avatar({ url: 'https://sub.bbc.co.uk/news' }).textContent, 'B');
  assert.equal(__avatar({ url: 'https://www.amazon.com.tr/dp/1' }).textContent, 'A');
  assert.equal(__avatar({ url: 'https://mail.google.com/mail' }).textContent, 'G');
  assert.equal(__key('tr.wikipedia.org'), 'wikipedia.org');
  assert.equal(__key('sub.bbc.co.uk'), 'bbc.co.uk');
});

test('avatar: düz host korunur; IP adresleri alan indirgemesine girmez', () => {
  const { __avatar, __key } = makeAvatarHarness();
  assert.equal(__avatar({ url: 'https://wikipedia.org/' }).textContent, 'W');
  assert.equal(__avatar({ url: 'http://localhost:8080/' }).textContent, 'L');
  // IP'de indirgeme yok — farklı sunucular aynı harf+tona düşmesin (#176 review).
  assert.equal(__key('192.168.1.1'), '192.168.1.1');
  assert.equal(__key('10.0.1.1'), '10.0.1.1');
  assert.notEqual(__key('192.168.1.1'), __key('10.0.1.1'));
  assert.equal(__avatar({ url: 'http://192.168.1.1/' }).textContent, '1');
});

test('avatar: adres önerisi işareti de kayıtlı-alan anahtarını kullanır', () => {
  const markStart = RENDERER.indexOf('function browserAddressResultMark');
  const markEnd = RENDERER.indexOf('\nfunction ', markStart);
  const src = RENDERER.slice(
    RENDERER.indexOf('const BROWSER_AVATAR_SECOND_LEVEL_TLDS'),
    RENDERER.indexOf('function browserCloseIcon'),
  ) + RENDERER.slice(markStart, markEnd) + '\n';
  const document = {
    createElement() {
      const el = {
        children: [], style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
        classList: { add() {}, contains: () => false },
        setAttribute() {}, appendChild(c) { this.children.push(c); }, append(...c) { this.children.push(...c); },
        textContent: '', width: 0, height: 0, alt: '', src: '',
      };
      return el;
    },
  };
  const ctx = vm.createContext({
    document, URL, Array, String, Set, Math,
    browserAddressResultHost: (r) => { try { return new URL(r.url || '').hostname.replace(/^www\./, ''); } catch { return ''; } },
  });
  vm.runInContext(`${src}; globalThis.__mark = browserAddressResultMark;`, ctx);
  const mark = ctx.__mark({ url: 'https://tr.wikipedia.org/wiki/X', icon: null });
  assert.equal(mark.textContent, 'W');
});

test('avatar: boş/geçersiz URL "+" ve is-blank döndürür; ton alan bazında sabit', () => {
  const { __avatar } = makeAvatarHarness();
  const blank = __avatar({ url: '' });
  assert.equal(blank.textContent, '+');
  assert.equal(blank.classList.contains('is-blank'), true);
  const a = __avatar({ url: 'https://mail.example.com/' });
  const b = __avatar({ url: 'https://drive.example.com/' });
  assert.equal(a.style.props['--avatar-hue'], b.style.props['--avatar-hue']);
});
