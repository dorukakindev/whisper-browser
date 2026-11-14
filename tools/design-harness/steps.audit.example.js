'use strict';
// Audit the podcast page and a show page at three widths. Read LOG.json AND look at every PNG.
const audit = "return " + require('./audit-snippet');
module.exports = [1920, 1440, 820, 420].flatMap((w) => [
  { name: 'home-' + w, size: [w, 900], code: "await MediaHomeUI.navigate('radio');return 1", wait: 1800, shot: 'a-library-' + w },
  { name: 'audit-library-' + w, code: audit, wait: 100 },
  { name: 'show-' + w, seq: [{ click: '.pl-programs .pl-program:nth-child(3)', wait: 800, shot: 'a-show-' + w }, { code: audit, label: 'audit-show-' + w }] },
]);
